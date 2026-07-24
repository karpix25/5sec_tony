import test from "node:test";
import assert from "node:assert/strict";
import { renderProjectAutomationControls } from "../src/ui/project-automation-controls.js";

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
