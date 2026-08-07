import test from "node:test";
import assert from "node:assert/strict";
import { createInitialState } from "../src/state/initial-state.js";
import { createStore } from "../src/state/store.js";
import { saveProjectAndRefreshAiMemory } from "../src/ui/project-ai.js";
import { bindProjectAutomationControls, renderProjectAutomationControls } from "../src/ui/project-automation-controls.js";

test("project automation limit field keeps rendered project-limit base", () => {
  const html = renderProjectAutomationControls(
    { id: "project-1", dailyLimit: 31, projectLimit: 101, usedTotal: 53 },
    {
      automation: { enabled: false, status: "done", lastMessage: "" },
      activeJobs: 0,
      remainingDaily: 31,
      remainingProject: 48,
      canRun: true
    }
  );

  assert.match(html, /name="projectLimit"[^>]+value="101"[^>]+data-project-limit-base="101"/);
});

test("project automation limit save passes rendered project-limit base", async () => {
  let changeHandler = null;
  const fields = {
    projectId: { value: "project-1" },
    dailyLimit: { value: "31" },
    projectLimit: { value: "101", dataset: { projectLimitBase: "100" } }
  };
  const panel = createPanel(fields, (type, handler) => {
    if (type === "change") changeHandler = handler;
  });
  const calls = [];

  bindProjectAutomationControls(createRoot(panel), {
    updateProjectSettingsRemote: async (payload, options) => calls.push({ payload, options })
  });
  changeHandler?.();
  await Promise.resolve();

  assert.equal(calls[0].payload.projectLimit, 101);
  assert.equal(calls[0].options.projectLimitBase, 100);
});

test("project settings submit passes rendered project-limit base", async () => {
  const originalFormData = globalThis.FormData;
  const form = createProjectSettingsForm({
    name: "GARANTIS",
    dailyLimit: "31",
    projectLimit: "101",
    projectTheme: "Тема",
    companyAudience: "ЦА",
    restrictions: "Нельзя"
  }, { projectLimitBase: "100" });
  const calls = [];
  const store = {
    getState: () => ({
      selectedProjectId: "project-1",
      projects: [{ id: "project-1", projectLimit: 100, usedTotal: 53, projectTheme: "Тема", companyAudience: "ЦА", restrictions: "Нельзя" }],
      products: []
    }),
    updateProjectSettingsRemote: async (payload, options) => calls.push({ payload, options })
  };
  globalThis.FormData = fakeFormDataFromValues;

  try {
    const result = await saveProjectAndRefreshAiMemory(form, store);
    await result?.aiRefresh;
  } finally {
    globalThis.FormData = originalFormData;
  }

  assert.equal(calls.length, 1);
  assert.equal(calls[0].payload.projectLimit, "101");
  assert.equal(calls[0].options.projectLimitBase, 100);
});

test("remote project update sends supplied project-limit base to backend", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const remoteState = createInitialState();
  const selectedProjectId = remoteState.selectedProjectId;
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url === "/api/state" && (!options.method || options.method === "GET")) {
      return jsonResponse({ state: remoteState, updatedAt: "t0" });
    }
    if (url === `/api/projects/${selectedProjectId}` && options.method === "PATCH") {
      const body = JSON.parse(options.body);
      return jsonResponse({ saved: true, project: body.project, updatedAt: "t1" });
    }
    return jsonResponse({ error: `unexpected ${url}` }, 500);
  };

  try {
    const store = createStore();
    await store.whenHydrated();
    calls.length = 0;

    await store.updateProjectSettingsRemote({ projectLimit: "101" }, { projectLimitBase: 100 });

    const body = JSON.parse(calls.find((call) => call.url.startsWith("/api/projects/")).options.body);
    assert.equal(body.project.projectLimit, 101);
    assert.equal(body.projectLimitBase, 100);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function createRoot(panel) {
  return {
    querySelector(selector) {
      return selector === "#automation-form" ? panel : null;
    }
  };
}

function createPanel(fields, addEventListener) {
  return {
    addEventListener,
    querySelector(selector) {
      if (selector === "[data-project-limit-note]") return { textContent: "" };
      const match = selector.match(/^\[name="(.+)"\]$/);
      return match ? fields[match[1]] || null : null;
    }
  };
}

function createProjectSettingsForm(values, datasets = {}) {
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
        dataset: name === "projectLimit" ? { projectLimitBase: datasets.projectLimitBase } : {},
        get value() { return state[name] || ""; },
        set value(nextValue) { state[name] = nextValue; }
      };
    },
    button,
    status
  };
}

class fakeFormDataFromValues {
  constructor(target) {
    this.entriesList = Object.entries(target.values);
  }
  entries() {
    return this.entriesList[Symbol.iterator]();
  }
  [Symbol.iterator]() {
    return this.entriesList[Symbol.iterator]();
  }
}

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  };
}
