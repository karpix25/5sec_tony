import test from "node:test";
import assert from "node:assert/strict";
import { bindGenerationPanelEvents } from "../src/ui/generation.js";
import { bindProjectAutomationControls } from "../src/ui/project-automation-controls.js";
import { projects, products } from "../src/domain/entities.js";
import { FakeElement } from "./helpers/fake-ui-dom.mjs";

function createGenerationDom(count = "1") {
  const root = new FakeElement();
  const createJobButton = new FakeElement({ id: "create-job", tagName: "button" });
  const countInput = new FakeElement({ id: "generation-count", value: count });
  const status = new FakeElement({ id: "creative-team-status" });
  root.append(createJobButton, countInput, status);
  return { root, createJobButton, status };
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
      updateGenerationBrief(brief) {
        state.generationBrief = brief;
        calls.push(["updateGenerationBrief", brief.hook]);
      },
      createPendingGenerationJobs(count) {
        calls.push(["createPendingGenerationJobs", count]);
        const jobs = Array.from({ length: count }, (_, index) => ({
          id: `job-${index + 1}`,
          projectId: project.id,
          productId: product.id,
          status: "running",
          stage: "brief",
          isBriefPlaceholder: true,
          title: `Готовим AI-бриф ${index + 1}/${count}`,
          topic: "AI-команда собирает сценарий и промпт"
        }));
        state.jobs.unshift(...jobs);
        return jobs;
      },
      replacePendingGenerationJob(jobId) {
        const job = {
          id: jobId,
          projectId: project.id,
          productId: product.id,
          status: "queued",
          stage: "brief",
          progress: 6,
          title: state.generationBrief?.hook || jobId,
          topic: state.generationBrief?.topic || ""
        };
        calls.push(["replacePendingGenerationJob", jobId, job.title]);
        state.jobs = state.jobs.map((item) => (item.id === jobId ? job : item));
        return job;
      },
      patchJob(jobId, patch) {
        calls.push(["patchJob", jobId, patch.status, patch.stage]);
        state.jobs = state.jobs.map((job) => (job.id === jobId ? { ...job, ...patch } : job));
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

test("generation start clamps invalid count for ai-created jobs and switches to queue tab", async () => {
  const previousFetch = globalThis.fetch;
  const { root, createJobButton } = createGenerationDom("99");
  const project = projects[0];
  const product = products.find((item) => item.projectId === project.id);
  const calls = [];
  globalThis.fetch = async (url, options = {}) => url === "/api/jobs/run"
    ? { ok: true, json: async () => ({ job: { id: JSON.parse(options.body).job.id, status: "done", progress: 100 } }) }
    : { ok: true, json: async () => ({ draft: { topic: "AI topic", hook: "AI hook" } }) };
  const { store } = createGenerationStoreDouble({ project, product, calls });

  try {
    bindGenerationPanelEvents(root, store);
    createJobButton.dispatchEvent({ type: "click", target: createJobButton });

    assert.deepEqual(calls.slice(0, 2), [
      ["createPendingGenerationJobs", 10],
      ["selectProjectTab", "queue"]
    ]);
    await waitForGenerationTicks(12);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("generation start prepares creative team brief before completing queued job", async () => {
  const previousFetch = globalThis.fetch;
  const { root, createJobButton, status } = createGenerationDom("1");
  const project = projects[0];
  const product = products.find((item) => item.projectId === project.id);
  const calls = [];
  globalThis.fetch = async (url, options = {}) => url === "/api/jobs/run"
    ? { ok: true, json: async () => ({ job: { id: JSON.parse(options.body).job.id, status: "done", progress: 100 } }) }
    : {
        ok: true,
        json: async () => ({
          draft: {
            creativeBrief: { topic: "Вечерний ритуал без срыва", formatIntent: "saveable_note" },
            recommendedHook: "Почему вечерний ритуал срывается",
            contentScript: { headline: "Ритуал срывается вечером", subhead: "Причина часто в ожиданиях", points: ["Сначала уберите шум", "Проверьте привычку"] },
            imagePromptPackage: { provider: "gpt-image-2", prompt: "Short creative team prompt" }
          }
        })
      };
  const { store } = createGenerationStoreDouble({ project, product, calls });

  try {
    bindGenerationPanelEvents(root, store);
    createJobButton.dispatchEvent({ type: "click", target: createJobButton });
    await waitForGenerationTicks();

    assert.deepEqual(calls.slice(0, 5), [
      ["createPendingGenerationJobs", 1],
      ["selectProjectTab", "queue"],
      ["updateGenerationBrief", "Почему вечерний ритуал срывается"],
      ["replacePendingGenerationJob", "job-1", "Почему вечерний ритуал срывается"],
      ["patchJob", "job-1", "running", "image"]
    ]);
    assert.equal(status.textContent, "Запущено 1 из 1.");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("generation batch prepares a fresh creative brief for each job", async () => {
  const previousFetch = globalThis.fetch;
  const { root, createJobButton, status } = createGenerationDom("2");
  const project = projects[0];
  const product = products.find((item) => item.projectId === project.id);
  const calls = [];
  let requestIndex = 0;
  globalThis.fetch = async (url, options = {}) => {
    if (url === "/api/jobs/run") {
      return { ok: true, json: async () => ({ job: { id: JSON.parse(options.body).job.id, status: "done", progress: 100 } }) };
    }
    requestIndex += 1;
    return {
      ok: true,
      json: async () => ({ draft: { topic: `Тема ${requestIndex}`, hook: `Хук ${requestIndex}` } })
    };
  };
  const { store } = createGenerationStoreDouble({ project, product, calls });

  try {
    bindGenerationPanelEvents(root, store);
    createJobButton.dispatchEvent({ type: "click", target: createJobButton });
    await waitForGenerationTicks(4);

    assert.deepEqual(calls.filter((item) => ["updateGenerationBrief", "replacePendingGenerationJob"].includes(item[0])), [
      ["updateGenerationBrief", "Хук 1"],
      ["replacePendingGenerationJob", "job-1", "Хук 1"],
      ["updateGenerationBrief", "Хук 2"],
      ["replacePendingGenerationJob", "job-2", "Хук 2"]
    ]);
    assert.equal(status.textContent, "Запущено 2 из 2.");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("generation batch sends previous batch jobs to creative team preflight", async () => {
  const previousFetch = globalThis.fetch;
  const { root, createJobButton } = createGenerationDom("2");
  const project = projects[0];
  const product = products.find((item) => item.projectId === project.id);
  const requestBodies = [];
  let requestIndex = 0;
  globalThis.fetch = async (url, options = {}) => {
    if (url === "/api/jobs/run") {
      return { ok: true, json: async () => ({ job: { id: JSON.parse(options.body).job.id, status: "done", progress: 100 } }) };
    }
    requestIndex += 1;
    requestBodies.push(JSON.parse(options.body));
    return {
      ok: true,
      json: async () => ({ draft: { topic: `Тема ${requestIndex}`, hook: `Хук ${requestIndex}` } })
    };
  };
  const { store } = createGenerationStoreDouble({ project, product });

  try {
    bindGenerationPanelEvents(root, store);
    createJobButton.dispatchEvent({ type: "click", target: createJobButton });
    await waitForGenerationTicks(4);

    assert.equal(requestBodies.length, 2);
    assert.equal(requestBodies[0].existingJobs.length, 0);
    assert.equal(requestBodies[1].existingJobs.some((job) => job.title === "Хук 1" || job.topic === "Тема 1"), true);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("generation batch starts prepared jobs when a later ai brief fails", async () => {
  const previousFetch = globalThis.fetch;
  const { root, createJobButton, status } = createGenerationDom("3");
  const project = projects[0];
  const product = products.find((item) => item.projectId === project.id);
  const calls = [];
  let briefRequestIndex = 0;
  globalThis.fetch = async (url, options = {}) => {
    if (url === "/api/jobs/run") {
      const payload = JSON.parse(options.body || "{}");
      const jobId = payload.job?.id;
      calls.push(["runServerJob", jobId]);
      return {
        ok: true,
        json: async () => ({ job: { id: jobId, status: "done", progress: 100 } })
      };
    }
    briefRequestIndex += 1;
    if (briefRequestIndex === 3) {
      return {
        ok: false,
        json: async () => ({ error: "OpenRouter не вернул JSON-черновик" })
      };
    }
    return {
      ok: true,
      json: async () => ({ draft: { topic: `Тема ${briefRequestIndex}`, hook: `Хук ${briefRequestIndex}` } })
    };
  };
  const { state, store } = createGenerationStoreDouble({ project, product, calls });

  try {
    bindGenerationPanelEvents(root, store);
    createJobButton.dispatchEvent({ type: "click", target: createJobButton });
    await waitForGenerationTicks(5);

    assert.equal(state.jobs.length, 3);
    assert.deepEqual(calls.filter((item) => item[0] === "replacePendingGenerationJob"), [["replacePendingGenerationJob", "job-1", "Хук 1"], ["replacePendingGenerationJob", "job-2", "Хук 2"]]);
    assert.deepEqual(calls.find((item) => item[0] === "selectProjectTab"), ["selectProjectTab", "queue"]);
    assert.deepEqual(calls.filter((item) => item[0] === "runServerJob"), [["runServerJob", "job-1"], ["runServerJob", "job-2"]]);
    assert.equal(state.jobs.find((job) => job.id === "job-3").status, "failed");
    assert.equal(status.textContent, "Запущено 2 из 3.");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("generation start marks queued placeholder failed when ai brief fails", async () => {
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
    assert.deepEqual(calls.slice(0, 2), [["createPendingGenerationJobs", 1], ["selectProjectTab", "queue"]]);
    await waitForGenerationTicks();

    assert.equal(state.jobs[0].status, "failed");
    assert.equal(state.jobs[0].failMsg, "OpenRouter upstream 502");
    assert.equal(status.textContent, "AI-брифы не подготовились. Проверьте очередь.");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("project automation form saves limits and normalizes enabled payload into running or paused state", () => {
  const root = new FakeElement();
  const panel = new FakeElement({ id: "automation-form" });
  const saveButton = new FakeElement({ id: "save-automation-settings", tagName: "button" });
  const projectId = new FakeElement({ name: "projectId", value: "project-1" });
  const dailyLimit = new FakeElement({ name: "dailyLimit", value: "24" });
  const projectLimit = new FakeElement({ name: "projectLimit", value: "400" });
  const enabled = new FakeElement({ name: "enabled", type: "checkbox", checked: true });
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

  panel.append(projectId, dailyLimit, projectLimit, enabled, saveButton);
  root.append(panel);
  bindProjectAutomationControls(root, store);
  saveButton.dispatchEvent({ type: "click", target: saveButton, currentTarget: saveButton });

  dailyLimit.value = "18";
  projectLimit.value = "300";
  enabled.checked = false;
  saveButton.dispatchEvent({ type: "click", target: saveButton, currentTarget: saveButton });

  assert.deepEqual(settingsCalls, [
    {
      dailyLimit: "24",
      projectLimit: "400"
    },
    {
      dailyLimit: "18",
      projectLimit: "300"
    }
  ]);

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
