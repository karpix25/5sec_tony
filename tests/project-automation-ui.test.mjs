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

test("project automation render ignores stale exhausted note when project has capacity", () => {
  const html = renderProjectAutomationControls(
    { id: "project-1", dailyLimit: 31, projectLimit: 101, usedTotal: 51 },
    {
      automation: {
        enabled: false,
        status: "done",
        lastMessage: "Лимит проекта исчерпан. Авторежим выключен."
      },
      activeJobs: 0,
      completedJobs: 51,
      remainingDaily: 2,
      remainingProject: 50,
      canRun: true
    }
  );

  assert.doesNotMatch(html, /<small class="automation-note">Лимит проекта исчерпан\.<\/small>/);
  assert.match(html, /Уже использовано: 51/);
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

test("project automation concurrency edits use automation save", async () => {
  let changeHandler = null;
  const fields = {
    projectId: { value: "project-1" },
    concurrency: { value: "3" }
  };
  const panel = {
    addEventListener(type, handler) {
      if (type === "change") changeHandler = handler;
    },
    querySelector(selector) {
      const match = selector.match(/^\[name="(.+)"\]$/);
      return match ? fields[match[1]] || null : null;
    }
  };
  const calls = [];
  const root = {
    querySelector(selector) {
      return selector === "#automation-form" ? panel : null;
    }
  };

  bindProjectAutomationControls(root, {
    updateProjectAutomationRemote: async (...args) => calls.push(args)
  });
  await changeHandler?.({ target: { name: "concurrency" } });

  assert.deepEqual(calls, [["project-1", { concurrency: 3 }]]);
});

test("project automation limit edit raises total limit above used total", async () => {
  let changeHandler = null;
  const fields = {
    projectId: { value: "project-1" },
    dailyLimit: { value: "31" },
    projectLimit: { value: "25" }
  };
  const note = { textContent: "" };
  const panel = {
    addEventListener(type, handler) {
      if (type === "change") changeHandler = handler;
    },
    querySelector(selector) {
      if (selector === "[data-project-limit-note]") return note;
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
    getState: () => ({
      selectedProjectId: "project-1",
      projects: [{ id: "project-1", usedTotal: 51, projectLimit: 51 }]
    }),
    updateProjectSettingsRemote: async (payload) => calls.push(payload)
  });
  changeHandler?.();
  await Promise.resolve();

  assert.deepEqual(calls, [{ dailyLimit: 31, projectLimit: 52 }]);
  assert.equal(fields.projectLimit.value, "52");
  assert.match(note.textContent, /уже использовано 51/i);
});
