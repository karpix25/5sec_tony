import test from "node:test";
import assert from "node:assert/strict";
import { saveProjectAndRefreshAiMemory } from "../src/ui/project-ai.js";

test("project save returns before ai memory request finishes", async () => {
  const originalFetch = globalThis.fetch;
  const originalFormData = globalThis.FormData;
  const form = createForm({ name: "Проект", projectTheme: "Новая тема", companyAudience: "" });
  const state = { selectedProjectId: "project", projects: [{ id: "project", projectTheme: "Старая тема", companyAudience: "" }], products: [] };
  const updates = [];
  let releaseAi;
  const store = {
    getState: () => state,
    updateProjectSettingsRemote: async (payload) => {
      updates.push({ type: "save", payload });
      state.projects[0] = { ...state.projects[0], ...payload };
    },
    updateProjectPatchRemote: async (projectId, patch) => {
      updates.push({ type: "ai", projectId, patch });
      state.projects[0] = { ...state.projects[0], ...patch };
    }
  };
  globalThis.FormData = FakeFormData;
  globalThis.fetch = () => new Promise((resolve) => {
    releaseAi = () => resolve({ ok: true, json: async () => ({ draft: { companyAudience: "AI ЦА" } }) });
  });

  try {
    const result = await saveProjectAndRefreshAiMemory(form, store);
    assert.equal(updates.length, 1);
    assert.equal(form.button.disabled, false);
    assert.match(form.status.textContent, /обновляется в фоне/i);
    releaseAi();
    await result.aiRefresh;
    assert.deepEqual(updates[1], { type: "ai", projectId: "project", patch: { companyAudience: "AI ЦА" } });
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.FormData = originalFormData;
  }
});

test("background ai memory always patches the project that started the request", async () => {
  const originalFetch = globalThis.fetch;
  const originalFormData = globalThis.FormData;
  const form = createForm({ name: "Первый", projectTheme: "Новая тема", companyAudience: "" });
  const state = {
    selectedProjectId: "project-1",
    projects: [
      { id: "project-1", projectTheme: "Старая тема", companyAudience: "" },
      { id: "project-2", projectTheme: "Другая тема", companyAudience: "Не менять" }
    ],
    products: [
      { id: "product-1", projectId: "project-1" },
      { id: "product-2", projectId: "project-2" }
    ]
  };
  let releaseSave;
  let aiRequest;
  const patched = [];
  const store = {
    getState: () => state,
    updateProjectSettingsRemote: async (payload) => {
      await new Promise((resolve) => { releaseSave = resolve; });
      state.projects[0] = { ...state.projects[0], ...payload };
    },
    updateProjectPatchRemote: async (projectId, patch) => {
      patched.push({ projectId, patch });
      state.projects = state.projects.map((project) => project.id === projectId ? { ...project, ...patch } : project);
    }
  };
  globalThis.FormData = FakeFormData;
  globalThis.fetch = async (_url, options) => {
    aiRequest = JSON.parse(options.body);
    return { ok: true, json: async () => ({ draft: { companyAudience: "AI ЦА" } }) };
  };

  try {
    const pendingSave = saveProjectAndRefreshAiMemory(form, store);
    await Promise.resolve();
    state.selectedProjectId = "project-2";
    releaseSave();
    const result = await pendingSave;
    await result.aiRefresh;
    assert.equal(aiRequest.project.id, "project-1");
    assert.deepEqual(aiRequest.products.map((product) => product.id), ["product-1"]);
    assert.deepEqual(patched, [{ projectId: "project-1", patch: { companyAudience: "AI ЦА" } }]);
    assert.equal(state.projects[1].companyAudience, "Не менять");
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.FormData = originalFormData;
  }
});

class FakeFormData {
  constructor(target) { this.entriesList = Object.entries(target.values); }
  entries() { return this.entriesList[Symbol.iterator](); }
  [Symbol.iterator]() { return this.entriesList[Symbol.iterator](); }
}

function createForm(values) {
  const button = { textContent: "Сохранить проект", disabled: false };
  const status = { textContent: "", dataset: {} };
  return {
    values: { ...values },
    button,
    status,
    querySelector(selector) {
      if (selector === "#save-project-settings") return button;
      if (selector === "#audience-expert-status") return status;
      const name = selector.match(/^\[name="(.+)"\]$/)?.[1];
      if (!name) return null;
      return {
        get value() { return values[name] || ""; },
        set value(nextValue) { values[name] = nextValue; }
      };
    }
  };
}
