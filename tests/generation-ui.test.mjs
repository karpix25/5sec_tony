import test from "node:test";
import assert from "node:assert/strict";
import { bindGenerationPanelEvents } from "../src/ui/generation.js";
import { bindProjectAutomationControls, renderProjectAutomationControls } from "../src/ui/project-automation-controls.js";
import { projects, products } from "../src/domain/entities.js";
import { FakeElement } from "./helpers/fake-ui-dom.mjs";

function createGenerationDom(count = "1", controls = {}) {
  const root = new FakeElement();
  const createJobButton = new FakeElement({ id: "create-job", tagName: "button" });
  const countInput = new FakeElement({ id: "generation-count", value: count });
  const distributeProducts = new FakeElement({ id: "generation-distribute-products", type: "checkbox" });
  const referenceSelect = new FakeElement({ id: "reference-select", tagName: "select", value: controls.referenceId || "" });
  const characterSelect = new FakeElement({ id: "character-select", tagName: "select", value: controls.characterId || "" });
  const audioSelect = new FakeElement({ id: "audio-select", tagName: "select", value: controls.audioId || "" });
  const status = new FakeElement({ id: "creative-team-status" });
  root.append(createJobButton, countInput, distributeProducts, referenceSelect, characterSelect, audioSelect, status);
  return { root, createJobButton, distributeProducts, status };
}

function createGenerationStoreDouble({ project, product, calls = [], rejectReservation = false }) {
  let batchIndex = 0;
  const state = {
    projects: [project],
    products: [product],
    selectedProjectId: project.id,
    selectedProductId: product.id,
    selectedReferenceId: project.references[0].id,
    selectedCharacterId: "__no_avatar__",
    selectedAudioId: "",
    audioLibrary: [],
    hookLibrary: {},
    jobs: []
  };
  return {
    state,
    store: {
      getState: () => state,
      createPendingServerGenerationBatch({ count, distributeProducts, selection }) {
        batchIndex += 1;
        const batchId = `batch-test-${batchIndex}`;
        if (rejectReservation) {
          const job = {
            id: `job-launch-failed-${batchIndex}`,
            projectId: project.id,
            productId: product.id,
            productName: product.name,
            referenceId: selection.referenceId,
            referenceTitle: project.references[0].title,
            status: "failed",
            stage: "brief",
            progress: 100,
            title: "Запуск не принят",
            failMsg: "Лимит проекта исчерпан"
          };
          calls.push(["createPendingServerGenerationBatch", count, distributeProducts, batchId, [job.id], false]);
          state.jobs = [job, ...state.jobs];
          return { batchId, jobs: [job], accepted: false, reason: job.failMsg };
        }
        const jobs = Array.from({ length: count }, (_, index) => ({
          id: `job-reserved-${batchIndex}-${index + 1}`,
          projectId: project.id,
          productId: product.id,
          productName: product.name,
          referenceId: selection.referenceId,
          referenceTitle: project.references[0].title,
          status: "running",
          stage: "brief",
          progress: 3,
          title: count > 1 ? `Готовим AI-бриф ${index + 1}/${count}` : "Готовим AI-бриф",
          topic: "AI-команда собирает сценарий и промпт",
          isBriefPlaceholder: true,
          serverOwned: true,
          serverBatchId: batchId,
          serverReservationStatus: "requested"
        }));
        calls.push(["createPendingServerGenerationBatch", count, distributeProducts, batchId, jobs.map((job) => job.id)]);
        state.jobs = [...jobs, ...state.jobs];
        return { batchId, jobs };
      },
      failPendingGenerationBatch(batchId, message) {
        calls.push(["failPendingGenerationBatch", batchId, message]);
        state.jobs = state.jobs.map((job) => job.serverBatchId === batchId ? {
          ...job,
          status: "failed",
          progress: 100,
          failMsg: message
        } : job);
      },
      mergeServerJobs(jobs = []) {
        calls.push(["mergeServerJobs", jobs.map((job) => job.id)]);
        state.jobs = [...jobs, ...state.jobs.filter((job) => !jobs.some((item) => item.id === job.id))];
        return jobs;
      },
      selectProjectTab(tab) {
        calls.push(["selectProjectTab", tab]);
      }
    }
  };
}

async function waitForGenerationTicks(count = 3) {
  for (let index = 0; index < count; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

test("generation start sends a clamped backend batch request and switches to queue tab", async () => {
  const previousFetch = globalThis.fetch;
  const { root, createJobButton, status } = createGenerationDom("99");
  const project = projects[0];
  const product = products.find((item) => item.projectId === project.id);
  const calls = [];
  const requests = [];
  globalThis.fetch = async (url, options = {}) => {
    const body = JSON.parse(options.body || "{}");
    requests.push([url, body]);
    return {
      ok: true,
      json: async () => ({
        batchId: "batch-1",
        jobs: body.reservation.jobIds.slice(0, 2).map((id) => ({
          id,
          projectId: project.id,
          productId: product.id,
          status: "running",
          stage: "brief",
          serverBatchId: body.reservation.batchId
        }))
      })
    };
  };
  const { state, store } = createGenerationStoreDouble({ project, product, calls });

  try {
    bindGenerationPanelEvents(root, store);
    createJobButton.dispatchEvent({ type: "click", target: createJobButton });
    assert.equal(state.jobs.length, 10);
    assert.equal(state.jobs[0].status, "running");
    assert.equal(state.jobs[0].stage, "brief");
    assert.equal(status.textContent, "Задача добавлена в очередь. Сервер подтверждает запуск...");
    await waitForGenerationTicks();

    assert.equal(requests[0][0], "/api/generation/batches");
    assert.equal(requests[0][1].count, 10);
    assert.equal(requests[0][1].distributeProducts, false);
    assert.deepEqual(requests[0][1].reservation, {
      batchId: "batch-test-1",
      jobIds: state.jobs.slice(0, 10).map((job) => job.id)
    });
    assert.deepEqual(requests[0][1].selection, {
      projectId: project.id,
      productId: product.id,
      referenceId: project.references[0].id,
      characterId: "__no_avatar__",
      audioId: "",
      freePrompt: ""
    });
    assert.deepEqual(calls, [
      ["createPendingServerGenerationBatch", 10, false, "batch-test-1", [
        "job-reserved-1-1",
        "job-reserved-1-2",
        "job-reserved-1-3",
        "job-reserved-1-4",
        "job-reserved-1-5",
        "job-reserved-1-6",
        "job-reserved-1-7",
        "job-reserved-1-8",
        "job-reserved-1-9",
        "job-reserved-1-10"
      ]],
      ["mergeServerJobs", ["job-reserved-1-1", "job-reserved-1-2"]],
      ["selectProjectTab", "queue"]
    ]);
    assert.equal(status.textContent, "Серверная очередь приняла 2 из 10.");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("generation project distribution mode is explicit", async () => {
  const previousFetch = globalThis.fetch;
  const { root, createJobButton, distributeProducts } = createGenerationDom("2");
  const project = projects[0];
  const product = products.find((item) => item.projectId === project.id);
  const requests = [];
  globalThis.fetch = async (url, options = {}) => {
    const body = JSON.parse(options.body || "{}");
    requests.push([url, body]);
    return {
      ok: true,
      json: async () => ({
        batchId: "batch-1",
        jobs: [{ id: body.reservation.jobIds[0], projectId: project.id, productId: product.id, status: "running", stage: "brief" }]
      })
    };
  };
  const { store } = createGenerationStoreDouble({ project, product });

  try {
    distributeProducts.checked = true;
    bindGenerationPanelEvents(root, store);
    createJobButton.dispatchEvent({ type: "click", target: createJobButton });
    await waitForGenerationTicks();

    assert.equal(requests[0][1].distributeProducts, true);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("generation start reserves visible queue jobs and does not call legacy job endpoints", async () => {
  const previousFetch = globalThis.fetch;
  const { root, createJobButton, status } = createGenerationDom("1");
  const project = projects[0];
  const product = products.find((item) => item.projectId === project.id);
  const calls = [];
  const urls = [];
  globalThis.fetch = async (url, options = {}) => {
    const body = JSON.parse(options.body || "{}");
    urls.push(url);
    return {
      ok: true,
      json: async () => ({
        batchId: body.reservation.batchId,
        jobs: [{ id: body.reservation.jobIds[0], projectId: project.id, productId: product.id, status: "running", stage: "brief" }]
      })
    };
  };
  const { state, store } = createGenerationStoreDouble({ project, product, calls });

  try {
    bindGenerationPanelEvents(root, store);
    createJobButton.dispatchEvent({ type: "click", target: createJobButton });
    assert.equal(state.jobs.length, 1);
    assert.equal(state.jobs[0].isBriefPlaceholder, true);
    await waitForGenerationTicks();

    assert.deepEqual(urls, ["/api/generation/batches"]);
    assert.deepEqual(calls, [
      ["createPendingServerGenerationBatch", 1, false, "batch-test-1", ["job-reserved-1-1"]],
      ["mergeServerJobs", ["job-reserved-1-1"]],
      ["selectProjectTab", "queue"]
    ]);
    assert.equal(status.textContent, "Серверная очередь приняла 1 из 1.");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("generation start marks visible queue reservation failed when backend enqueue fails", async () => {
  const previousFetch = globalThis.fetch;
  const { root, createJobButton, status } = createGenerationDom("1");
  const project = projects[0];
  const product = products.find((item) => item.projectId === project.id);
  const calls = [];
  globalThis.fetch = async () => ({
    ok: false,
    json: async () => ({ error: "OpenRouter upstream 502" })
  });
  const { state, store } = createGenerationStoreDouble({ project, product, calls });

  try {
    bindGenerationPanelEvents(root, store);
    createJobButton.dispatchEvent({ type: "click", target: createJobButton });
    await waitForGenerationTicks();

    assert.equal(state.jobs.length, 1);
    assert.equal(state.jobs[0].status, "failed");
    assert.equal(state.jobs[0].failMsg, "OpenRouter upstream 502");
    assert.deepEqual(calls, [
      ["createPendingServerGenerationBatch", 1, false, "batch-test-1", ["job-reserved-1-1"]],
      ["failPendingGenerationBatch", "batch-test-1", "OpenRouter upstream 502"],
      ["selectProjectTab", "queue"]
    ]);
    assert.equal(status.textContent, "OpenRouter upstream 502. Генерация не запущена.");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("generation start keeps visible rejected reservation when local quota is exhausted", async () => {
  const previousFetch = globalThis.fetch;
  const { root, createJobButton, status } = createGenerationDom("1");
  const project = projects[0];
  const product = products.find((item) => item.projectId === project.id);
  const calls = [];
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(url);
    throw new Error("server should not be called");
  };
  const { state, store } = createGenerationStoreDouble({ project, product, calls, rejectReservation: true });

  try {
    bindGenerationPanelEvents(root, store);
    createJobButton.dispatchEvent({ type: "click", target: createJobButton });
    await waitForGenerationTicks();

    assert.deepEqual(urls, []);
    assert.equal(state.jobs.length, 1);
    assert.equal(state.jobs[0].status, "failed");
    assert.equal(state.jobs[0].title, "Запуск не принят");
    assert.deepEqual(calls, [
      ["createPendingServerGenerationBatch", 1, false, "batch-test-1", ["job-launch-failed-1"], false],
      ["selectProjectTab", "queue"]
    ]);
    assert.equal(status.textContent, "Лимит проекта исчерпан. Генерация не запущена.");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("project automation button toggles autorun without saving project limits", () => {
  const root = new FakeElement();
  const panel = new FakeElement({ id: "automation-form" });
  const startButton = new FakeElement({ id: "toggle-automation-mode", tagName: "button", dataset: { nextEnabled: "true" } });
  const projectId = new FakeElement({ name: "projectId", value: "project-1" });
  const dailyLimit = new FakeElement({ name: "dailyLimit", value: "24" });
  const projectLimit = new FakeElement({ name: "projectLimit", value: "400" });
  const settingsCalls = [];
  const automationCalls = [];
  const store = {
    updateProjectSettings(payload) {
      settingsCalls.push(payload);
    },
    updateProjectAutomation(projectId, payload) {
      automationCalls.push([projectId, payload]);
    }
  };

  panel.append(projectId, dailyLimit, projectLimit, startButton);
  root.append(panel);
  bindProjectAutomationControls(root, store);
  startButton.dispatchEvent({ type: "click", target: startButton, currentTarget: startButton });

  dailyLimit.value = "18";
  projectLimit.value = "300";
  startButton.dataset.nextEnabled = "false";
  startButton.dispatchEvent({ type: "click", target: startButton, currentTarget: startButton });

  assert.deepEqual(settingsCalls, []);

  assert.deepEqual(automationCalls, [
    ["project-1", {
      enabled: true,
      status: "running",
      lastMessage: "Авторежим включен."
    }],
    ["project-1", {
      enabled: false,
      status: "paused",
      lastMessage: "Авторежим остановлен."
    }]
  ]);
});

test("project automation change ignores blank total limit instead of saving it as one", () => {
  const root = new FakeElement();
  const panel = new FakeElement({ id: "automation-form" });
  const projectId = new FakeElement({ name: "projectId", value: "project-1" });
  const dailyLimit = new FakeElement({ name: "dailyLimit", value: "18" });
  const projectLimit = new FakeElement({ name: "projectLimit", value: "" });
  const batchSize = new FakeElement({ name: "batchSize", value: "2" });
  const concurrency = new FakeElement({ name: "concurrency", value: "1" });
  const settingsCalls = [];
  const automationCalls = [];
  const store = {
    updateProjectSettings(payload) {
      settingsCalls.push(payload);
    },
    updateProjectAutomation(projectId, payload) {
      automationCalls.push([projectId, payload]);
    }
  };

  panel.append(projectId, dailyLimit, projectLimit, batchSize, concurrency);
  root.append(panel);
  bindProjectAutomationControls(root, store);
  panel.dispatchEvent({ type: "change", target: projectLimit, currentTarget: panel });

  assert.deepEqual(settingsCalls, [{ dailyLimit: 18 }]);
  assert.deepEqual(automationCalls, [["project-1", { batchSize: 2, concurrency: 1 }]]);
});

test("project automation render shows waiting daily-limit state without disabling autorun", () => {
  const html = renderProjectAutomationControls(
    { id: "project-1", dailyLimit: 100, projectLimit: 176 },
    {
      automation: {
        enabled: true,
        status: "waiting",
        lastMessage: "Дневной лимит исчерпан. Авторежим включен и продолжит после обновления дневного лимита."
      },
      activeJobs: 0,
      completedJobs: 90,
      remainingDaily: 0,
      remainingProject: 92,
      canRun: false
    }
  );

  assert.match(html, /Лимит дня/);
  assert.match(html, /Остановить авторежим/);
  assert.doesNotMatch(html, /Цель готова/);
  assert.doesNotMatch(html, /До цели/);
});

test("project automation render shows queue error as retryable", () => {
  const html = renderProjectAutomationControls(
    { id: "project-1", dailyLimit: 20, projectLimit: 126 },
    {
      automation: {
        enabled: true,
        status: "error",
        lastMessage: "Серверная очередь не настроена. Авторежим не запущен."
      },
      activeJobs: 0,
      completedJobs: 16,
      dailyUsage: { used: 2, limit: 20 },
      remainingDaily: 18,
      remainingProject: 110,
      canRun: false
    }
  );

  assert.match(html, /Ошибка очереди/);
  assert.match(html, /Повторить авторежим/);
  assert.match(html, /data-next-enabled="true"/);
  assert.match(html, /Серверная очередь не настроена/);
});

test("project automation retry button sets autorun back to running", () => {
  const root = new FakeElement();
  const panel = new FakeElement({ id: "automation-form" });
  const retryButton = new FakeElement({ id: "toggle-automation-mode", tagName: "button", dataset: { nextEnabled: "true" } });
  const projectId = new FakeElement({ name: "projectId", value: "project-1" });
  const automationCalls = [];
  const store = {
    updateProjectAutomation(projectId, payload) {
      automationCalls.push([projectId, payload]);
    }
  };

  panel.append(projectId, retryButton);
  root.append(panel);
  bindProjectAutomationControls(root, store);
  retryButton.dispatchEvent({ type: "click", target: retryButton, currentTarget: retryButton });

  assert.deepEqual(automationCalls, [
    ["project-1", {
      enabled: true,
      status: "running",
      lastMessage: "Авторежим включен."
    }]
  ]);
});

test("project automation render does not turn legacy done status into project limit", () => {
  const html = renderProjectAutomationControls(
    { id: "project-1", dailyLimit: 20, projectLimit: 126 },
    {
      automation: {
        enabled: false,
        status: "done",
        lastMessage: "Цель авторежима выполнена."
      },
      activeJobs: 0,
      completedJobs: 16,
      remainingDaily: 4,
      remainingProject: 110,
      canRun: false
    }
  );

  assert.match(html, /Выключен/);
  assert.match(html, /Включить авторежим/);
  assert.doesNotMatch(html, /Лимит проекта/);
  assert.doesNotMatch(html, /Цель авторежима выполнена/);
});
