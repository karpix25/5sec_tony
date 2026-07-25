import test from "node:test";
import assert from "node:assert/strict";
import { bindProjectAutomationControls, renderProjectAutomationControls } from "../src/ui/project-automation-controls.js";

test("project automation render prioritizes exhausted project limit over active jobs", () => {
  const html = renderProjectAutomationControls(
    { id: "project-1", dailyLimit: 100, projectLimit: 1 },
    {
      automation: {
        enabled: true,
        status: "running",
        lastMessage: "Авторежим ждёт завершения активных задач."
      },
      activeJobs: 2,
      completedJobs: 454,
      remainingDaily: 74,
      remainingProject: 0,
      canRun: false
    }
  );

  assert.match(html, /Лимит проекта/);
  assert.doesNotMatch(html, /В работе/);
});

test("project automation limit edits use remote project save when available", async () => {
  let changeHandler = null;
  const fields = {
    projectId: { value: "project-1" },
    dailyLimit: { value: "31" },
    projectLimit: { value: "30" }
  };
  const panel = {
    addEventListener(type, handler) {
      if (type === "change") changeHandler = handler;
    },
    querySelector(selector) {
      const match = selector.match(/^\[name="(.+)"\]$/);
      if (match) return fields[match[1]] || null;
      return null;
    }
  };
  const calls = [];
  const root = {
    querySelector(selector) {
      return selector === "#automation-form" ? panel : null;
    }
  };

  bindProjectAutomationControls(root, {
    updateProjectSettingsRemote: async (payload) => calls.push(payload),
    updateProjectSettings: () => calls.push({ local: true })
  });
  changeHandler?.();
  await Promise.resolve();

  assert.deepEqual(calls, [{ dailyLimit: 31, projectLimit: 30 }]);
});
