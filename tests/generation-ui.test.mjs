import test from "node:test";
import assert from "node:assert/strict";
import { bindGenerationPanelEvents } from "../src/ui/generation.js";
import { bindProjectAutomationControls, renderProjectAutomationControls } from "../src/ui/project-automation-controls.js";
import { projects, products } from "../src/domain/entities.js";
import { FakeElement } from "./helpers/fake-ui-dom.mjs";

function createGenerationDom(count = "1") {
  const root = new FakeElement();
  const createJobButton = new FakeElement({ id: "create-job", tagName: "button" });
  const countInput = new FakeElement({ id: "generation-count", value: count });
  const distributeProducts = new FakeElement({ id: "generation-distribute-products", type: "checkbox" });
  const status = new FakeElement({ id: "creative-team-status" });
  root.append(createJobButton, countInput, distributeProducts, status);
  return { root, createJobButton, distributeProducts, status };
}

function createGenerationStoreDouble({ project, product, calls = [] }) {
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
    requests.push([url, JSON.parse(options.body || "{}")]);
    return {
      ok: true,
      json: async () => ({
        batchId: "batch-1",
        jobs: [
          { id: "job-1", projectId: project.id, productId: product.id, status: "running", stage: "brief" },
          { id: "job-2", projectId: project.id, productId: product.id, status: "running", stage: "brief" }
        ]
      })
    };
  };
  const { store } = createGenerationStoreDouble({ project, product, calls });

  try {
    bindGenerationPanelEvents(root, store);
    createJobButton.dispatchEvent({ type: "click", target: createJobButton });
    await waitForGenerationTicks();

    assert.equal(requests[0][0], "/api/generation/batches");
    assert.equal(requests[0][1].count, 10);
    assert.equal(requests[0][1].distributeProducts, false);
    assert.deepEqual(requests[0][1].selection, {
      projectId: project.id,
      productId: product.id,
      referenceId: project.references[0].id,
      characterId: "__no_avatar__",
      audioId: "",
      freePrompt: ""
    });
    assert.deepEqual(calls, [
      ["mergeServerJobs", ["job-1", "job-2"]],
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
    requests.push([url, JSON.parse(options.body || "{}")]);
    return {
      ok: true,
      json: async () => ({
        batchId: "batch-1",
        jobs: [{ id: "job-1", projectId: project.id, productId: product.id, status: "running", stage: "brief" }]
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

test("generation start does not create browser placeholders or call legacy job endpoints", async () => {
  const previousFetch = globalThis.fetch;
  const { root, createJobButton, status } = createGenerationDom("1");
  const project = projects[0];
  const product = products.find((item) => item.projectId === project.id);
  const calls = [];
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(url);
    return {
      ok: true,
      json: async () => ({
        batchId: "batch-1",
        jobs: [{ id: "job-1", projectId: project.id, productId: product.id, status: "running", stage: "brief" }]
      })
    };
  };
  const { store } = createGenerationStoreDouble({ project, product, calls });

  try {
    bindGenerationPanelEvents(root, store);
    createJobButton.dispatchEvent({ type: "click", target: createJobButton });
    await waitForGenerationTicks();

    assert.deepEqual(urls, ["/api/generation/batches"]);
    assert.deepEqual(calls, [
      ["mergeServerJobs", ["job-1"]],
      ["selectProjectTab", "queue"]
    ]);
    assert.equal(status.textContent, "Серверная очередь приняла 1 из 1.");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("generation start shows backend enqueue errors without local placeholder jobs", async () => {
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

    assert.equal(state.jobs.length, 0);
    assert.deepEqual(calls, []);
    assert.equal(status.textContent, "OpenRouter upstream 502. Генерация не запущена.");
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

test("project automation render stays enabled when only daily limit is exhausted", () => {
  const html = renderProjectAutomationControls(
    { id: "project-1", dailyLimit: 100, projectLimit: 176 },
    {
      automation: {
        enabled: true,
        status: "running",
        lastMessage: "Авторежим включен."
      },
      activeJobs: 0,
      completedJobs: 90,
      remainingDaily: 0,
      remainingProject: 92,
      canRun: true
    }
  );

  assert.match(html, /Включен/);
  assert.match(html, /Остановить авторежим/);
  assert.doesNotMatch(html, /Лимит дня/);
  assert.doesNotMatch(html, /Цель готова/);
  assert.doesNotMatch(html, /До цели/);
});
