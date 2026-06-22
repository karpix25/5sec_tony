import test from "node:test";
import assert from "node:assert/strict";
import { bindGenerationPanelEvents } from "../src/ui/generation.js";
import { bindProjectAutomationControls } from "../src/ui/project-automation-controls.js";
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

test("project automation form saves limits and normalizes enabled payload into running or paused state", () => {
  const originalFormData = globalThis.FormData;
  const root = new FakeElement();
  const form = new FakeElement({ id: "automation-form", tagName: "form" });
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

  globalThis.FormData = class FakeFormData {
    constructor(target) {
      this.target = target;
    }
    entries() {
      return Object.entries(this.target.formValues)[Symbol.iterator]();
    }
  };

  try {
    form.formValues = {
      projectId: "project-1",
      dailyLimit: "24",
      projectLimit: "400",
      enabled: "on"
    };
    root.append(form);
    bindProjectAutomationControls(root, store);
    form.dispatchEvent({ type: "submit", target: form, currentTarget: form });

    form.formValues = {
      projectId: "project-1",
      dailyLimit: "18",
      projectLimit: "300"
    };
    form.dispatchEvent({ type: "submit", target: form, currentTarget: form });
  } finally {
    globalThis.FormData = originalFormData;
  }

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

test("generation cta controls stay inside project workflow handlers", () => {
  const originalFormData = globalThis.FormData;
  const root = new FakeElement();
  const panel = new FakeElement({ className: "generation-cta-panel" });
  const form = new FakeElement({
    tagName: "form",
    dataset: { ctaOverlayForm: "project-1", ctaScope: "project" }
  });
  form.formValues = { text: "ЧИТАЙ ОПИСАНИЕ", enabled: "on", mode: "badge" };
  const actions = new FakeElement({ className: "avatar-cta-actions" });
  const generate = new FakeElement({ tagName: "button", dataset: { ctaGenerate: "project-1" } });
  const approve = new FakeElement({ tagName: "button", dataset: { ctaApprove: "project-1" } });
  const reset = new FakeElement({ tagName: "button", dataset: { ctaReset: "project-1" } });
  const status = new FakeElement({ tagName: "span", className: "avatar-cta-status idle", textContent: "Стандарт" });
  const note = new FakeElement({ tagName: "small", dataset: { ctaStatusNote: "" }, textContent: "" });
  actions.append(generate, approve, reset, status);
  form.append(actions, note);
  panel.append(form);
  root.append(panel);

  const calls = [];
  const store = {
    updateProjectAutomation() {},
    updateProjectCtaOverlay(payload) {
      calls.push(["updateProjectCtaOverlay", payload]);
    },
    createProjectCtaCandidate(payload) {
      calls.push(["createProjectCtaCandidate", payload]);
    },
    approveProjectCtaCandidate() {
      calls.push(["approveProjectCtaCandidate"]);
    },
    resetProjectCtaOverlay() {
      calls.push(["resetProjectCtaOverlay"]);
    }
  };

  globalThis.FormData = class FakeFormData {
    constructor(target) {
      this.target = target;
    }
    entries() {
      return Object.entries(this.target.formValues)[Symbol.iterator]();
    }
  };

  try {
    bindGenerationPanelEvents(root, store);
    form.dispatchEvent({ type: "change", currentTarget: form, target: form });
    generate.dispatchEvent({ type: "click", target: generate });
    approve.dispatchEvent({ type: "click", target: approve });
    reset.dispatchEvent({ type: "click", target: reset });
  } finally {
    globalThis.FormData = originalFormData;
  }

  assert.deepEqual(calls, [
    ["updateProjectCtaOverlay", { text: "ЧИТАЙ ОПИСАНИЕ", enabled: true, mode: "badge" }],
    ["createProjectCtaCandidate", { text: "ЧИТАЙ ОПИСАНИЕ", enabled: true, mode: "badge" }],
    ["approveProjectCtaCandidate"],
    ["resetProjectCtaOverlay"]
  ]);
});
