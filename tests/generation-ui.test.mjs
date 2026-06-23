import test from "node:test";
import assert from "node:assert/strict";
import { bindGenerationPanelEvents } from "../src/ui/generation.js";
import { bindProjectAutomationControls } from "../src/ui/project-automation-controls.js";
import { projects, products } from "../src/domain/entities.js";
import { FakeElement } from "./helpers/fake-ui-dom.mjs";

test("generation start clamps invalid count and switches to queue tab", () => {
  const root = new FakeElement();
  const createJobButton = new FakeElement({ id: "create-job" });
  const countInput = new FakeElement({ id: "generation-count", value: "99" });
  const calls = [];
  const store = {
    createJobs(count) {
      calls.push(["createJobs", count]);
      return [];
    },
    selectProjectTab(tab) {
      calls.push(["selectProjectTab", tab]);
    }
  };

  root.append(createJobButton, countInput);
  bindGenerationPanelEvents(root, store);
  createJobButton.dispatchEvent({ type: "click", target: createJobButton });

  assert.deepEqual(calls, [
    ["createJobs", 10],
    ["selectProjectTab", "queue"]
  ]);
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
      return null;
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
