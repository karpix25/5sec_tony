import test from "node:test";
import assert from "node:assert/strict";
import { saveProjectAndRefreshAiMemory } from "../src/ui/project-ai.js";

test("project save keeps fresh form values after ai memory refresh", async () => {
  const originalFetch = globalThis.fetch;
  const originalFormData = globalThis.FormData;
  const form = createProjectSettingsForm({
    name: "Проект",
    yandexDiskFolder: "disk:/ВИДЕО/Старое",
    exportFolder: "Старое",
    dailyLimit: "20",
    projectLimit: "100",
    projectTheme: "Тема",
    companyAudience: "ЦА",
    restrictions: "Нельзя"
  });
  const updates = [];
  const store = {
    getState: () => ({ selectedProjectId: "project", projects: [{ id: "project", companyInfo: "" }], products: [] }),
    updateProjectSettings: (payload) => updates.push({ ...payload })
  };

  globalThis.FormData = class FakeFormData {
    constructor(target) {
      this.entriesList = Object.entries(target.values);
    }
    entries() {
      return this.entriesList[Symbol.iterator]();
    }
    [Symbol.iterator]() {
      return this.entriesList[Symbol.iterator]();
    }
  };
  globalThis.fetch = async () => {
    form.values.dailyLimit = "33";
    form.values.yandexDiskFolder = "disk:/ВИДЕО/5сек/Новое";
    return { ok: true, json: async () => ({ draft: { companyAudience: "AI ЦА" } }) };
  };

  try {
    await saveProjectAndWaitForAi(form, store);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.FormData = originalFormData;
  }

  assert.equal(updates[0].dailyLimit, "20");
  assert.equal(updates.length, 1);
  assert.equal(form.values.dailyLimit, "33");
  assert.equal(form.values.yandexDiskFolder, "disk:/ВИДЕО/5сек/Новое");
});

test("project save only applies ai memory to empty fields", async () => {
  const originalFetch = globalThis.fetch;
  const originalFormData = globalThis.FormData;
  const form = createProjectSettingsForm({
    name: "Проект",
    yandexDiskFolder: "disk:/ВИДЕО/Старое",
    dailyLimit: "20",
    projectLimit: "100",
    projectTheme: "Тема",
    companyAudience: "",
    toneOfVoice: "Ручной тон"
  });
  const updates = [];
  const store = {
    getState: () => ({ selectedProjectId: "project", projects: [{ id: "project", companyInfo: "" }], products: [] }),
    updateProjectSettings: (payload) => updates.push({ ...payload })
  };

  globalThis.FormData = class FakeFormData {
    constructor(target) {
      this.entriesList = Object.entries(target.values);
    }
    entries() {
      return this.entriesList[Symbol.iterator]();
    }
    [Symbol.iterator]() {
      return this.entriesList[Symbol.iterator]();
    }
  };
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ draft: { companyAudience: "AI ЦА", toneOfVoice: "AI тон" } })
  });

  try {
    await saveProjectAndWaitForAi(form, store);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.FormData = originalFormData;
  }

  assert.equal(updates.at(-1).companyAudience, "AI ЦА");
  assert.equal(updates.at(-1).toneOfVoice, "Ручной тон");
});

test("project save can repair object-object placeholder values from ai memory", async () => {
  const originalFetch = globalThis.fetch;
  const originalFormData = globalThis.FormData;
  const form = createProjectSettingsForm({
    name: "Проект",
    yandexDiskFolder: "disk:/ВИДЕО/Старое",
    dailyLimit: "20",
    projectLimit: "100",
    projectTheme: "Тема",
    companyAudience: "[object Object],[object Object],[object Object]"
  });
  const updates = [];
  const store = {
    getState: () => ({ selectedProjectId: "project", projects: [{ id: "project", companyInfo: "" }], products: [] }),
    updateProjectSettings: (payload) => updates.push({ ...payload })
  };

  globalThis.FormData = class FakeFormData {
    constructor(target) {
      this.entriesList = Object.entries(target.values);
    }
    entries() {
      return this.entriesList[Symbol.iterator]();
    }
    [Symbol.iterator]() {
      return this.entriesList[Symbol.iterator]();
    }
  };
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ draft: { companyAudience: "Женщины 25-35\nМамы" } })
  });

  try {
    await saveProjectAndWaitForAi(form, store);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.FormData = originalFormData;
  }

  assert.equal(updates.at(-1).companyAudience, "Женщины 25-35\nМамы");
  assert.doesNotMatch(updates.at(-1).companyAudience, /\[object Object\]/);
});

test("project save reads fresh values from live form after rerender", async () => {
  const originalFetch = globalThis.fetch;
  const originalFormData = globalThis.FormData;
  const originalDocument = globalThis.document;
  const staleForm = createProjectSettingsForm({
    name: "Проект",
    yandexDiskFolder: "disk:/ВИДЕО/Старое",
    exportFolder: "Старое",
    dailyLimit: "20",
    projectLimit: "100",
    projectTheme: "Тема",
    companyAudience: "Старая ЦА",
    restrictions: "Нельзя"
  });
  const liveForm = createProjectSettingsForm({
    name: "Проект",
    yandexDiskFolder: "disk:/ВИДЕО/5сек/Новое",
    exportFolder: "Новое",
    dailyLimit: "33",
    projectLimit: "100",
    projectTheme: "Тема",
    companyAudience: "Новая ЦА",
    restrictions: "Нельзя"
  });
  const updates = [];
  const store = {
    getState: () => ({ selectedProjectId: "project", projects: [{ id: "project", companyInfo: "" }], products: [] }),
    updateProjectSettings: (payload) => updates.push({ ...payload })
  };

  globalThis.document = {
    querySelector(selector) {
      return selector === "#project-settings-form" ? liveForm : null;
    }
  };
  globalThis.FormData = class FakeFormData {
    constructor(target) {
      this.entriesList = Object.entries(target.values);
    }
    entries() {
      return this.entriesList[Symbol.iterator]();
    }
    [Symbol.iterator]() {
      return this.entriesList[Symbol.iterator]();
    }
  };
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ draft: { companyAudience: "AI ЦА" } }) });

  try {
    await saveProjectAndWaitForAi(staleForm, store);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.FormData = originalFormData;
    globalThis.document = originalDocument;
  }

  assert.equal(updates[0].dailyLimit, "20");
  assert.equal(updates.length, 1);
  assert.equal(liveForm.values.dailyLimit, "33");
  assert.equal(liveForm.values.exportFolder, "Новое");
  assert.equal(liveForm.values.companyAudience, "Новая ЦА");
});

test("project save keeps manual ai-field edits made while request is running", async () => {
  const originalFetch = globalThis.fetch;
  const originalFormData = globalThis.FormData;
  const originalDocument = globalThis.document;
  const staleForm = createProjectSettingsForm({
    name: "Проект",
    yandexDiskFolder: "disk:/ВИДЕО/Старое",
    exportFolder: "Старое",
    dailyLimit: "20",
    projectLimit: "100",
    projectTheme: "Тема",
    companyAudience: "Старая ЦА",
    restrictions: "Нельзя"
  });
  const liveForm = createProjectSettingsForm({
    name: "Проект",
    yandexDiskFolder: "disk:/ВИДЕО/Старое",
    exportFolder: "Старое",
    dailyLimit: "20",
    projectLimit: "100",
    projectTheme: "Тема",
    companyAudience: "Ручная новая ЦА",
    restrictions: "Нельзя"
  });
  const updates = [];
  const store = {
    getState: () => ({ selectedProjectId: "project", projects: [{ id: "project", companyInfo: "" }], products: [] }),
    updateProjectSettings: (payload) => updates.push({ ...payload })
  };

  globalThis.document = {
    querySelector(selector) {
      return selector === "#project-settings-form" ? liveForm : null;
    }
  };
  globalThis.FormData = class FakeFormData {
    constructor(target) {
      this.entriesList = Object.entries(target.values);
    }
    entries() {
      return this.entriesList[Symbol.iterator]();
    }
    [Symbol.iterator]() {
      return this.entriesList[Symbol.iterator]();
    }
  };
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ draft: { companyAudience: "AI ЦА" } }) });

  try {
    await saveProjectAndWaitForAi(staleForm, store);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.FormData = originalFormData;
    globalThis.document = originalDocument;
  }

  assert.equal(updates.length, 1);
  assert.equal(liveForm.values.companyAudience, "Ручная новая ЦА");
  assert.match(liveForm.status.textContent, /данные уже изменились/i);
});

test("project save skips ai memory refresh for limit-only changes", async () => {
  const originalFetch = globalThis.fetch;
  const originalFormData = globalThis.FormData;
  const form = createProjectSettingsForm({
    name: "Проект",
    dailyLimit: "31",
    projectLimit: "25",
    projectTheme: "Тема",
    companyAudience: "ЦА",
    restrictions: "Нельзя"
  });
  const updates = [];
  const fetchCalls = [];
  const store = {
    getState: () => ({
      selectedProjectId: "project",
      projects: [{
        id: "project",
        name: "Проект",
        dailyLimit: 20,
        projectLimit: 21,
        projectTheme: "Тема",
        companyAudience: "ЦА",
        restrictions: "Нельзя"
      }],
      products: []
    }),
    updateProjectSettings: (payload) => updates.push({ ...payload })
  };
  globalThis.FormData = class FakeFormData {
    constructor(target) {
      this.entriesList = Object.entries(target.values);
    }
    entries() {
      return this.entriesList[Symbol.iterator]();
    }
    [Symbol.iterator]() {
      return this.entriesList[Symbol.iterator]();
    }
  };
  globalThis.fetch = async () => {
    fetchCalls.push("ai");
    return { ok: true, json: async () => ({ draft: { companyAudience: "AI ЦА" } }) };
  };

  try {
    await saveProjectAndWaitForAi(form, store);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.FormData = originalFormData;
  }

  assert.equal(updates.length, 1);
  assert.equal(updates[0].projectLimit, "25");
  assert.deepEqual(fetchCalls, []);
  assert.equal(form.status.textContent, "Проект сохранен.");
});

test("project save raises total limit above already used generations", async () => {
  const originalFormData = globalThis.FormData;
  const form = createProjectSettingsForm({
    name: "GARANTIS",
    dailyLimit: "31",
    projectLimit: "25",
    projectTheme: "Тема",
    companyAudience: "ЦА",
    restrictions: "Нельзя"
  });
  const updates = [];
  const project = { id: "project", name: "GARANTIS", dailyLimit: 31, projectLimit: 51, usedTotal: 51, projectTheme: "Тема", companyAudience: "ЦА", restrictions: "Нельзя" };
  const store = {
    getState: () => ({ selectedProjectId: "project", projects: [project], products: [] }),
    updateProjectSettings: (payload) => updates.push({ ...payload })
  };
  globalThis.FormData = class FakeFormData {
    constructor(target) { this.entriesList = Object.entries(target.values); }
    entries() { return this.entriesList[Symbol.iterator](); }
    [Symbol.iterator]() { return this.entriesList[Symbol.iterator](); }
  };

  try {
    await saveProjectAndWaitForAi(form, store);
  } finally {
    globalThis.FormData = originalFormData;
  }

  assert.equal(updates.length, 1);
  assert.equal(updates[0].projectLimit, "52");
  assert.equal(form.values.projectLimit, "52");
  assert.match(form.status.textContent, /уже использовано 51/i);
});

test("project save recovers UI when state save throws", async () => {
  const originalFormData = globalThis.FormData;
  const form = createProjectSettingsForm({ name: "Проект", companyAudience: "ЦА" });
  const store = {
    getState: () => ({ selectedProjectId: "project", projects: [{ id: "project" }], products: [] }),
    updateProjectSettings: () => { throw new Error("storage quota"); }
  };
  globalThis.FormData = class FakeFormData {
    constructor(target) {
      this.entriesList = Object.entries(target.values);
    }
    entries() {
      return this.entriesList[Symbol.iterator]();
    }
  };

  try {
    await saveProjectAndWaitForAi(form, store);
  } finally {
    globalThis.FormData = originalFormData;
  }

  assert.equal(form.button.disabled, false);
  assert.equal(form.button.textContent, "Сохранить проект");
  assert.match(form.status.textContent, /Не удалось сохранить проект: storage quota/);
  assert.equal(form.status.dataset.tone, "error");
});

test("project save keeps saved status when only ai memory fails", async () => {
  const originalFetch = globalThis.fetch;
  const originalFormData = globalThis.FormData;
  const form = createProjectSettingsForm({ name: "Проект", companyAudience: "ЦА" });
  const updates = [];
  const store = {
    getState: () => ({ selectedProjectId: "project", projects: [{ id: "project", audienceObjections: "Старое возражение" }], products: [] }),
    updateProjectSettings: (payload) => updates.push({ ...payload })
  };
  globalThis.FormData = class FakeFormData {
    constructor(target) {
      this.entriesList = Object.entries(target.values);
    }
    entries() {
      return this.entriesList[Symbol.iterator]();
    }
  };
  globalThis.fetch = async () => ({ ok: false, json: async () => ({ error: "AI timeout" }) });

  try {
    await saveProjectAndWaitForAi(form, store);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.FormData = originalFormData;
  }

  assert.equal(updates.length, 1);
  assert.match(form.status.textContent, /Проект сохранен\. AI-память обновим позже\./);
  assert.equal(form.button.disabled, false);
});

test("project save strips replacement signs from ai memory text", async () => {
  const originalFetch = globalThis.fetch;
  const originalFormData = globalThis.FormData;
  const form = createProjectSettingsForm({
    name: "Проект",
    yandexDiskFolder: "disk:/ВИДЕО/Старое",
    dailyLimit: "20",
    projectLimit: "100",
    audienceObjections: ""
  });
  const updates = [];
  const store = {
    getState: () => ({ selectedProjectId: "project", projects: [{ id: "project", audienceObjections: "Старое возражение" }], products: [] }),
    updateProjectSettings: (payload) => updates.push({ ...payload })
  };
  globalThis.FormData = class FakeFormData {
    constructor(target) {
      this.entriesList = Object.entries(target.values);
    }
    entries() {
      return this.entriesList[Symbol.iterator]();
    }
    [Symbol.iterator]() {
      return this.entriesList[Symbol.iterator]();
    }
  };
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      draft: {
        audienceObjections: "Это просто мар��тинг, эффекта не будет"
      }
    })
  });

  try {
    await saveProjectAndWaitForAi(form, store);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.FormData = originalFormData;
  }

  assert.equal(updates.at(-1).audienceObjections, "Это просто мартинг, эффекта не будет");
  assert.doesNotMatch(JSON.stringify(updates), /\uFFFD/);
  assert.doesNotMatch(form.status.textContent, /битый текст|�/);
  assert.equal(form.button.disabled, false);
});

function createProjectSettingsForm(values) {
  const button = { textContent: "Сохранить проект", disabled: false };
  const status = { textContent: "", dataset: {} };
  const state = { ...values };
  return {
    values: state,
    querySelector(selector) {
      if (selector === "#save-project-settings") return this.button;
      if (selector === "#audience-expert-status") return this.status;
      const match = selector.match(/^\[name="(.+)"\]$/);
      if (!match) return null;
      const name = match[1];
      return {
        get value() {
          return state[name] || "";
        },
        set value(nextValue) {
          state[name] = nextValue;
        }
      };
    },
    button,
    status
  };
}

async function saveProjectAndWaitForAi(form, store) {
  const result = await saveProjectAndRefreshAiMemory(form, store);
  await result?.aiRefresh;
  return result;
}
