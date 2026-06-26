import test from "node:test";
import assert from "node:assert/strict";
import { bindGenerationPanelEvents } from "../src/ui/generation.js";
import { bindProjectAutomationControls } from "../src/ui/project-automation-controls.js";
import { projects, products } from "../src/domain/entities.js";
import { FakeElement } from "./helpers/fake-ui-dom.mjs";

test("generation start clamps invalid count for ai-created jobs and switches to queue tab", async () => {
  const previousFetch = globalThis.fetch;
  const root = new FakeElement();
  const createJobButton = new FakeElement({ id: "create-job" });
  const countInput = new FakeElement({ id: "generation-count", value: "99" });
  const status = new FakeElement({ id: "creative-team-status" });
  const project = projects[0];
  const product = products.find((item) => item.projectId === project.id);
  const calls = [];
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ draft: { topic: "AI topic", hook: "AI hook" } })
  });
  const store = {
    getState: () => ({
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
    }),
    updateGenerationBrief() {},
    createJob() {
      calls.push(["createJob"]);
      return { id: `job-${calls.length}`, projectId: project.id };
    },
    selectProjectTab(tab) {
      calls.push(["selectProjectTab", tab]);
    }
  };

  try {
    root.append(createJobButton, countInput, status);
    bindGenerationPanelEvents(root, store);
    createJobButton.dispatchEvent({ type: "click", target: createJobButton });
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(calls.filter((item) => item[0] === "createJob").length, 10);
    assert.deepEqual(calls.at(-1), ["selectProjectTab", "queue"]);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("generation start prepares creative team brief before creating jobs", async () => {
  const previousFetch = globalThis.fetch;
  const root = new FakeElement();
  const createJobButton = new FakeElement({ id: "create-job" });
  const countInput = new FakeElement({ id: "generation-count", value: "1" });
  const status = new FakeElement({ id: "creative-team-status" });
  const project = projects[0];
  const product = products.find((item) => item.projectId === project.id);
  const calls = [];
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      draft: {
        creativeBrief: { topic: "Вечерний ритуал без срыва", formatIntent: "saveable_note" },
        recommendedHook: "Почему вечерний ритуал срывается",
        contentScript: { headline: "Ритуал срывается вечером", subhead: "Причина часто в ожиданиях", points: ["Сначала уберите шум", "Проверьте привычку"] },
        imagePromptPackage: { provider: "gpt-image-2", prompt: "Short creative team prompt" }
      }
    })
  });
  const store = {
    getState: () => ({
      projects: [project],
      products: [product],
      selectedProjectId: project.id,
      selectedProductId: product.id,
      selectedReferenceId: project.references[0].id,
      selectedCharacterId: "no-avatar",
      selectedAudioId: "",
      audioLibrary: [],
      hookLibrary: {},
      jobs: []
    }),
    updateGenerationBrief(brief) {
      calls.push(["updateGenerationBrief", brief.hook]);
    },
    createJob() {
      calls.push(["createJob"]);
      return { id: "job-1", projectId: project.id };
    },
    selectProjectTab(tab) {
      calls.push(["selectProjectTab", tab]);
    }
  };

  try {
    root.append(createJobButton, countInput, status);
    bindGenerationPanelEvents(root, store);
    createJobButton.dispatchEvent({ type: "click", target: createJobButton });
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.deepEqual(calls, [
      ["updateGenerationBrief", "Почему вечерний ритуал срывается"],
      ["createJob"],
      ["selectProjectTab", "queue"]
    ]);
    assert.equal(status.textContent, "AI-команда подготовила сценарий и промпт.");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("generation batch prepares a fresh creative brief for each job", async () => {
  const previousFetch = globalThis.fetch;
  const root = new FakeElement();
  const createJobButton = new FakeElement({ id: "create-job" });
  const countInput = new FakeElement({ id: "generation-count", value: "2" });
  const status = new FakeElement({ id: "creative-team-status" });
  const project = projects[0];
  const product = products.find((item) => item.projectId === project.id);
  const calls = [];
  let requestIndex = 0;
  globalThis.fetch = async () => {
    requestIndex += 1;
    return {
      ok: true,
      json: async () => ({ draft: { topic: `Тема ${requestIndex}`, hook: `Хук ${requestIndex}` } })
    };
  };
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
  const store = {
    getState: () => state,
    updateGenerationBrief(brief) {
      calls.push(["updateGenerationBrief", brief.hook]);
    },
    createJob() {
      calls.push(["createJob"]);
      return { id: `job-${calls.filter((item) => item[0] === "createJob").length + 1}`, projectId: project.id };
    },
    createJobs(count) {
      calls.push(["createJobs", count]);
      return [];
    },
    selectProjectTab(tab) {
      calls.push(["selectProjectTab", tab]);
    }
  };

  try {
    root.append(createJobButton, countInput, status);
    bindGenerationPanelEvents(root, store);
    createJobButton.dispatchEvent({ type: "click", target: createJobButton });
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.deepEqual(calls, [
      ["updateGenerationBrief", "Хук 1"],
      ["createJob"],
      ["updateGenerationBrief", "Хук 2"],
      ["createJob"],
      ["selectProjectTab", "queue"]
    ]);
    assert.equal(status.textContent, "AI-команда подготовила сценарий и промпт.");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("generation batch sends previous batch jobs to creative team preflight", async () => {
  const previousFetch = globalThis.fetch;
  const root = new FakeElement();
  const createJobButton = new FakeElement({ id: "create-job" });
  const countInput = new FakeElement({ id: "generation-count", value: "2" });
  const status = new FakeElement({ id: "creative-team-status" });
  const project = projects[0];
  const product = products.find((item) => item.projectId === project.id);
  const requestBodies = [];
  let requestIndex = 0;
  globalThis.fetch = async (_url, options) => {
    requestIndex += 1;
    requestBodies.push(JSON.parse(options.body));
    return {
      ok: true,
      json: async () => ({ draft: { topic: `Тема ${requestIndex}`, hook: `Хук ${requestIndex}` } })
    };
  };
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
  const createdJobs = [];
  const store = {
    getState: () => state,
    updateGenerationBrief() {},
    createJob() {
      const job = { id: `job-${createdJobs.length + 1}`, projectId: project.id, title: `Хук ${createdJobs.length + 1}`, topic: `Тема ${createdJobs.length + 1}` };
      createdJobs.push(job);
      return job;
    },
    selectProjectTab() {}
  };

  try {
    root.append(createJobButton, countInput, status);
    bindGenerationPanelEvents(root, store);
    createJobButton.dispatchEvent({ type: "click", target: createJobButton });
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(requestBodies.length, 2);
    assert.equal(requestBodies[0].existingJobs.length, 0);
    assert.equal(requestBodies[1].existingJobs.some((job) => job.title === "Хук 1" || job.topic === "Тема 1"), true);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("generation batch starts prepared jobs when a later ai brief fails", async () => {
  const previousFetch = globalThis.fetch;
  const root = new FakeElement();
  const createJobButton = new FakeElement({ id: "create-job" });
  const countInput = new FakeElement({ id: "generation-count", value: "3" });
  const status = new FakeElement({ id: "creative-team-status" });
  const project = projects[0];
  const product = products.find((item) => item.projectId === project.id);
  const jobs = [];
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
    jobs
  };
  const store = {
    getState: () => state,
    updateGenerationBrief(brief) {
      calls.push(["updateGenerationBrief", brief.hook]);
    },
    createJob() {
      const job = { id: `job-${jobs.length + 1}`, projectId: project.id, status: "queued", progress: 0 };
      jobs.push(job);
      calls.push(["createJob", job.id]);
      return job;
    },
    patchJob(jobId, patch) {
      calls.push(["patchJob", jobId, patch.status]);
      Object.assign(jobs.find((job) => job.id === jobId), patch);
    },
    selectProjectTab(tab) {
      calls.push(["selectProjectTab", tab]);
    }
  };

  try {
    root.append(createJobButton, countInput, status);
    bindGenerationPanelEvents(root, store);
    createJobButton.dispatchEvent({ type: "click", target: createJobButton });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(jobs.length, 2);
    assert.deepEqual(calls.filter((item) => item[0] === "createJob"), [["createJob", "job-1"], ["createJob", "job-2"]]);
    assert.deepEqual(calls.find((item) => item[0] === "selectProjectTab"), ["selectProjectTab", "queue"]);
    assert.deepEqual(calls.filter((item) => item[0] === "runServerJob"), [["runServerJob", "job-1"], ["runServerJob", "job-2"]]);
    assert.equal(status.textContent, "Запущено 2 из 3. Следующий AI-бриф не подготовился: OpenRouter не вернул JSON-черновик.");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("generation start does not create local fallback job when ai brief fails", async () => {
  const previousFetch = globalThis.fetch;
  const root = new FakeElement();
  const createJobButton = new FakeElement({ id: "create-job", tagName: "button" });
  const countInput = new FakeElement({ id: "generation-count", value: "1" });
  const status = new FakeElement({ id: "creative-team-status" });
  const project = projects[0];
  const product = products.find((item) => item.projectId === project.id);
  const calls = [];
  globalThis.fetch = async () => ({
    ok: false,
    json: async () => ({ error: "OpenRouter upstream 502" })
  });
  const store = {
    getState: () => ({
      projects: [project],
      products: [product],
      selectedProjectId: project.id,
      selectedProductId: product.id,
      selectedReferenceId: project.references[0].id,
      selectedCharacterId: "no-avatar",
      selectedAudioId: "",
      audioLibrary: [],
      hookLibrary: {},
      jobs: []
    }),
    updateGenerationBrief(brief) {
      calls.push(["updateGenerationBrief", brief.hook]);
    },
    createJob() {
      calls.push(["createJob"]);
      return null;
    },
    selectProjectTab(tab) {
      calls.push(["selectProjectTab", tab]);
    }
  };

  try {
    root.append(createJobButton, countInput, status);
    bindGenerationPanelEvents(root, store);
    createJobButton.dispatchEvent({ type: "click", target: createJobButton });
    assert.deepEqual(calls, []);
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.deepEqual(calls, []);
    assert.equal(status.textContent, "OpenRouter upstream 502. Генерация не запущена.");
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
