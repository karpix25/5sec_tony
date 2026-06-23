import test from "node:test";
import assert from "node:assert/strict";
import { bindQueuePanelEvents, updateQueuePanel } from "../src/ui/queue.js";
import { FakeElement } from "./helpers/fake-ui-dom.mjs";

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
