import test from "node:test";
import assert from "node:assert/strict";
import { bindGenerationPanelEvents } from "../src/ui/generation.js";
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

test("generation automation form normalizes enabled payload into running or paused state", () => {
  const originalFormData = globalThis.FormData;
  const root = new FakeElement();
  const form = new FakeElement({ id: "automation-form", tagName: "form" });
  const storeCalls = [];
  const store = {
    updateProjectAutomation(projectId, payload) {
      storeCalls.push([projectId, payload]);
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
      enabled: "on",
      targetCount: "12",
      batchSize: "3",
      concurrency: "2"
    };
    root.append(form);
    bindGenerationPanelEvents(root, store);
    form.dispatchEvent({ type: "submit", target: form, currentTarget: form });

    form.formValues = {
      projectId: "project-1",
      targetCount: "6",
      batchSize: "1",
      concurrency: "1"
    };
    form.dispatchEvent({ type: "submit", target: form, currentTarget: form });
  } finally {
    globalThis.FormData = originalFormData;
  }

  assert.deepEqual(storeCalls, [
    ["project-1", {
      enabled: true,
      targetCount: "12",
      batchSize: "3",
      concurrency: "2",
      status: "running",
      lastMessage: "Авторежим включен."
    }],
    ["project-1", {
      enabled: false,
      targetCount: "6",
      batchSize: "1",
      concurrency: "1",
      status: "paused",
      lastMessage: "Авторежим остановлен."
    }]
  ]);
});
