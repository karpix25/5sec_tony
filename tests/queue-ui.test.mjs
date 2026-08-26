import test from "node:test";
import assert from "node:assert/strict";
import { bindQueuePanelEvents, renderQueuePanel, updateQueuePanel } from "../src/ui/queue.js";
import { FakeElement } from "./helpers/fake-ui-dom.mjs";

test("queue pagination keeps a just-created local job visible", () => {
  const project = { id: "project-1" };
  const localJob = {
    id: "local-job",
    projectId: project.id,
    productId: "product-1",
    status: "failed",
    stage: "brief",
    title: "Запуск не принят",
    failMsg: "Лимит проекта исчерпан"
  };
  const remoteJob = {
    id: "remote-job",
    projectId: project.id,
    productId: "product-1",
    status: "running",
    stage: "image",
    title: "Удалённая задача"
  };
  const pagination = {
    ensure() {},
    getState() {
      return {
        key: "project-1:product-1:current",
        filter: "current",
        jobs: [remoteJob],
        localJobIds: [localJob.id],
        total: 1,
        page: 1,
        loading: false,
        error: ""
      };
    }
  };

  const html = renderQueuePanel({
    queueProductFilter: "current",
    products: [{ id: "product-1", name: "Продукт" }],
    jobs: [localJob]
  }, { project, product: { id: "product-1", name: "Продукт" } }, { pagination });

  assert.match(html, /Запуск не принят/);
  assert.match(html, /Удалённая задача/);
});

test("queue delete buttons bind once and rebind after partial list rerender", () => {
  const root = new FakeElement();
  const panel = new FakeElement({ className: "queue-panel" });
  const list = new FakeElement({ className: "queue-list" });
  const firstButton = new FakeElement({ dataset: { deleteJob: "job-1" } });
  const deleted = [];
  const store = {
    deleteJob(id) {
      deleted.push(id);
    }
  };

  root.append(panel);
  panel.append(list);
  list.append(firstButton);

  bindQueuePanelEvents(root, store);
  bindQueuePanelEvents(root, store);
  firstButton.dispatchEvent({ type: "click", target: firstButton });
  assert.deepEqual(deleted, ["job-1"]);

  const secondButton = new FakeElement({ dataset: { deleteJob: "job-2" } });
  list.children = [secondButton];
  secondButton.parentNode = list;

  const updated = updateQueuePanel(root, {
    jobs: [{
      id: "job-2",
      projectId: "project-1",
      productId: "product-1",
      status: "review",
      stage: "approval",
      outputType: "image",
      productVisualMode: "exact-product",
      inputRefs: [{ role: "product" }],
      imageUrl: "https://cdn.example.com/image.png",
      title: "Новая задача"
    }],
    products: [{ id: "product-1", name: "Продукт" }]
  }, {
    project: { id: "project-1" }
  }, store);

  assert.equal(updated, true);
  assert.match(list.innerHTML, /Новая задача/);
  assert.match(list.innerHTML, /Продукт в кадре/);
  secondButton.dispatchEvent({ type: "click", target: secondButton });
  assert.deepEqual(deleted, ["job-1", "job-2"]);
});

test("queue defaults to current product and can show all project products", () => {
  const root = new FakeElement();
  const panel = new FakeElement({ className: "queue-panel" });
  const list = new FakeElement({ className: "queue-list" });
  const filterCurrent = new FakeElement({ dataset: { queueProductFilter: "current" } });
  const filterAll = new FakeElement({ dataset: { queueProductFilter: "all" } });
  const selectedFilters = [];
  root.append(panel);
  panel.append(filterCurrent, filterAll, list);

  updateQueuePanel(root, {
    queueProductFilter: "current",
    jobs: [
      {
        id: "job-current",
        projectId: "project-1",
        productId: "product-1",
        productName: "Снимок продукта",
        status: "review",
        stage: "approval",
        outputType: "image",
        imageUrl: "https://cdn.example.com/current.png",
        title: "Задача выбранного продукта"
      },
      {
        id: "job-other",
        projectId: "project-1",
        productId: "product-2",
        status: "review",
        stage: "approval",
        outputType: "image",
        imageUrl: "https://cdn.example.com/other.png",
        title: "Задача другого продукта"
      }
    ],
    products: [
      { id: "product-1", name: "Переименованный продукт" },
      { id: "product-2", name: "Другой продукт" }
    ]
  }, {
    project: { id: "project-1" },
    product: { id: "product-1", name: "Выбранный продукт" }
  }, {
    deleteJob() {},
    selectQueueProductFilter(filter) {
      selectedFilters.push(filter);
    }
  });

  assert.match(list.innerHTML, /Задача выбранного продукта/);
  assert.doesNotMatch(list.innerHTML, /Задача другого продукта/);
  assert.match(list.innerHTML, /Продукт: Снимок продукта/);
  filterAll.dispatchEvent({ type: "click", target: filterAll });
  assert.deepEqual(selectedFilters, ["all"]);

  updateQueuePanel(root, {
    queueProductFilter: "all",
    jobs: [
      { id: "job-current", projectId: "project-1", productId: "product-1", status: "review", stage: "approval", title: "Задача выбранного продукта" },
      { id: "job-other", projectId: "project-1", productId: "product-2", status: "review", stage: "approval", title: "Задача другого продукта" }
    ],
    products: [
      { id: "product-1", name: "Выбранный продукт" },
      { id: "product-2", name: "Другой продукт" }
    ]
  }, {
    project: { id: "project-1" },
    product: { id: "product-1", name: "Выбранный продукт" }
  }, { deleteJob() {} });

  assert.match(list.innerHTML, /Задача выбранного продукта/);
  assert.match(list.innerHTML, /Задача другого продукта/);
});

test("queue partial update refreshes product filter counters", () => {
  const root = new FakeElement();
  const panel = new FakeElement({ className: "queue-panel" });
  const filterWrap = new FakeElement({ className: "queue-filter-wrap" });
  const list = new FakeElement({ className: "queue-list" });
  root.append(panel);
  panel.append(filterWrap, list);

  updateQueuePanel(root, {
    queueProductFilter: "current",
    jobs: [
      { id: "job-current", projectId: "project-1", productId: "product-1", status: "review", stage: "approval", title: "Задача выбранного продукта" },
      { id: "job-other", projectId: "project-1", productId: "product-2", status: "review", stage: "approval", title: "Задача другого продукта" }
    ],
    products: [
      { id: "product-1", name: "Выбранный продукт" },
      { id: "product-2", name: "Другой продукт" }
    ]
  }, {
    project: { id: "project-1" },
    product: { id: "product-1", name: "Выбранный продукт" }
  }, { deleteJob() {} });

  assert.match(filterWrap.innerHTML, /Текущий продукт \(1\)/);
  assert.match(filterWrap.innerHTML, /Все продукты проекта \(2\)/);

  updateQueuePanel(root, {
    queueProductFilter: "current",
    jobs: [
      { id: "job-current", projectId: "project-1", productId: "product-1", status: "review", stage: "approval", title: "Задача выбранного продукта" }
    ],
    products: [{ id: "product-1", name: "Выбранный продукт" }]
  }, {
    project: { id: "project-1" },
    product: { id: "product-1", name: "Выбранный продукт" }
  }, { deleteJob() {} });

  assert.match(filterWrap.innerHTML, /Текущий продукт \(1\)/);
  assert.match(filterWrap.innerHTML, /Все продукты проекта \(1\)/);
});

test("queue renders newest generations first", () => {
  const root = new FakeElement();
  const panel = new FakeElement({ className: "queue-panel" });
  const list = new FakeElement({ className: "queue-list" });
  root.append(panel);
  panel.append(list);

  updateQueuePanel(root, {
    queueProductFilter: "current",
    jobs: [
      { id: "old-job", projectId: "project-1", productId: "product-1", status: "done", stage: "export", title: "Старая генерация", createdAt: "2026-07-24T10:00:00.000Z" },
      { id: "new-job", projectId: "project-1", productId: "product-1", status: "running", stage: "image", title: "Новая генерация", createdAt: "2026-07-24T12:00:00.000Z" }
    ],
    products: [{ id: "product-1", name: "Продукт" }]
  }, {
    project: { id: "project-1" },
    product: { id: "product-1", name: "Продукт" }
  }, { deleteJob() {} });

  assert.ok(list.innerHTML.indexOf("Новая генерация") < list.innerHTML.indexOf("Старая генерация"));
});

test("queue shows generation start time and duration", () => {
  const root = new FakeElement();
  const panel = new FakeElement({ className: "queue-panel" });
  const list = new FakeElement({ className: "queue-list" });
  root.append(panel);
  panel.append(list);

  updateQueuePanel(root, {
    jobs: [{
      id: "job-timed",
      projectId: "project-1",
      productId: "product-1",
      status: "done",
      queueStatus: "completed",
      stage: "export",
      outputType: "final-video",
      finalVideoUrl: "/generated/final.mp4",
      serverJobAcceptedAt: "2026-07-24T15:00:00.000Z",
      serverJobCompletedAt: "2026-07-24T15:03:12.000Z",
      title: "Задача со временем"
    }],
    products: [{ id: "product-1", name: "Продукт" }]
  }, {
    project: { id: "project-1" }
  }, { deleteJob() {} });

  assert.match(list.innerHTML, /Создано:/);
  assert.match(list.innerHTML, /Время генерации: 3 мин 12 сек/);
});

test("queue final video waiting state keeps preview disabled until video is ready", () => {
  const root = new FakeElement();
  const panel = new FakeElement({ className: "queue-panel" });
  const list = new FakeElement({ className: "queue-list" });
  root.append(panel);
  panel.append(list);

  updateQueuePanel(root, {
    jobs: [{
      id: "job-video",
      projectId: "project-1",
      productId: "product-1",
      status: "processing",
      stage: "assembly",
      outputType: "final-video",
      requiresFinalVideo: true,
      imageUrl: "https://cdn.example.com/frame.png",
      title: "Видео в сборке"
    }],
    products: [{ id: "product-1", name: "Продукт" }]
  }, {
    project: { id: "project-1" }
  }, { deleteJob() {} });

  assert.match(list.innerHTML, /queue-preview" type="button" disabled/);
  assert.match(list.innerHTML, /Картинка готова, собираем финальное видео/);
  assert.match(list.innerHTML, /Собираем видео/);
});

test("queue waiting state explains final video assembly without avatar", () => {
  const root = new FakeElement();
  const panel = new FakeElement({ className: "queue-panel" });
  const list = new FakeElement({ className: "queue-list" });
  root.append(panel);
  panel.append(list);

  updateQueuePanel(root, {
    jobs: [{
      id: "job-video-no-avatar",
      projectId: "project-1",
      productId: "product-1",
      status: "processing",
      stage: "assembly",
      outputType: "final-video",
      requiresFinalVideo: true,
      productVisualMode: "no-package",
      characterId: "__no_avatar__",
      imageUrl: "https://cdn.example.com/frame.png",
      title: "Видео без аватара"
    }],
    products: [{ id: "product-1", name: "Продукт" }]
  }, {
    project: { id: "project-1" }
  }, { deleteJob() {} });

  assert.match(list.innerHTML, /Картинка готова, сейчас собираем mp4 из картинки и аудио\./);
  assert.match(list.innerHTML, /Без продукта в кадре/);
});

test("queue translates provider text length errors into operator message", () => {
  const root = new FakeElement();
  const panel = new FakeElement({ className: "queue-panel" });
  const list = new FakeElement({ className: "queue-list" });
  root.append(panel);
  panel.append(list);

  updateQueuePanel(root, {
    jobs: [{
      id: "job-long-prompt",
      projectId: "project-1",
      productId: "product-1",
      status: "failed",
      stage: "image",
      outputType: "image",
      productVisualMode: "no-package",
      failMsg: "The text length cannot exceed the maximum limit",
      title: "Слишком длинный промпт"
    }],
    products: [{ id: "product-1", name: "Продукт" }]
  }, {
    project: { id: "project-1" }
  }, { deleteJob() {} });

  assert.match(list.innerHTML, /Промпт получился слишком длинным для генератора/);
  assert.doesNotMatch(list.innerHTML, /The text length cannot exceed/);
});

test("queueStatus failed renders an error even when job status is still running", () => {
  const root = new FakeElement();
  const panel = new FakeElement({ className: "queue-panel" });
  const list = new FakeElement({ className: "queue-list" });
  root.append(panel);
  panel.append(list);

  updateQueuePanel(root, {
    jobs: [{
      id: "job-queue-failed",
      projectId: "project-1",
      productId: "product-1",
      status: "running",
      queueStatus: "failed",
      stage: "image",
      outputType: "image",
      failMsg: "Передали генерацию серверу...",
      queueLastError: "Worker lock expired",
      title: "Задача потеряла worker lock"
    }],
    products: [{ id: "product-1", name: "Продукт" }]
  }, {
    project: { id: "project-1" }
  }, { deleteJob() {} });

  assert.match(list.innerHTML, /Ошибка/);
  assert.match(list.innerHTML, /Worker lock expired/);
  assert.match(list.innerHTML, /queue-loader error/);
  assert.doesNotMatch(list.innerHTML, /Ждем картинку/);
});

test("queue retry state is visible instead of looking like a normal running job", () => {
  const root = new FakeElement();
  const panel = new FakeElement({ className: "queue-panel" });
  const list = new FakeElement({ className: "queue-list" });
  root.append(panel);
  panel.append(list);

  updateQueuePanel(root, {
    jobs: [{
      id: "job-queue-retrying",
      projectId: "project-1",
      productId: "product-1",
      status: "running",
      queueStatus: "retrying",
      stage: "image",
      outputType: "image",
      title: "Задача повторяется"
    }],
    products: [{ id: "product-1", name: "Продукт" }]
  }, {
    project: { id: "project-1" }
  }, { deleteJob() {} });

  assert.match(list.innerHTML, /Повторная попытка/);
  assert.match(list.innerHTML, /Предыдущая попытка завершилась ошибкой/);
});
