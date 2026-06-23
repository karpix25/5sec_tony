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
