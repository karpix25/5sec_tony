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
    form.values.yandexDiskFolder = "disk:/ВИДЕО/Новое/Готовые";
    return { ok: true, json: async () => ({ draft: { companyAudience: "AI ЦА" } }) };
  };

  try {
    await saveProjectAndRefreshAiMemory(form, store);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.FormData = originalFormData;
  }

  assert.equal(updates[0].dailyLimit, "20");
  assert.equal(updates.at(-1).dailyLimit, "33");
  assert.equal(updates.at(-1).yandexDiskFolder, "disk:/ВИДЕО/Новое/Готовые");
  assert.equal(updates.at(-1).companyAudience, "AI ЦА");
});

function createProjectSettingsForm(values) {
  const button = { textContent: "Сохранить проект", disabled: false };
  const status = { textContent: "", dataset: {} };
  const state = { ...values };
  return {
    values: state,
    querySelector(selector) {
      if (selector === "#save-project-settings") return button;
      if (selector === "#audience-expert-status") return status;
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
    }
  };
}
