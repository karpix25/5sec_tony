import test from "node:test";
import assert from "node:assert/strict";
import { formatAutomationStats, updateGenerationAutomationStats } from "../src/ui/generation-live.js";

test("automation stats formatter includes live counters and message", () => {
  const text = formatAutomationStats({
    automation: { lastMessage: "Авторежим включен." },
    activeJobs: 2,
    completedJobs: 5,
    remainingProject: 18
  });

  assert.match(text, /Готово: 5\./);
  assert.match(text, /В работе: 2\./);
  assert.doesNotMatch(text, /До цели/);
  assert.doesNotMatch(text, /Дневной остаток/);
  assert.match(text, /Остаток проекта: 18\./);
  assert.match(text, /Авторежим включен\./);
});

test("automation stats formatter hides legacy completed target message", () => {
  const text = formatAutomationStats({
    automation: { status: "done", lastMessage: "Цель авторежима выполнена." },
    activeJobs: 0,
    completedJobs: 90,
    remainingProject: 92
  });

  assert.doesNotMatch(text, /Цель авторежима выполнена/);
  assert.doesNotMatch(text, /До цели/);
});

test("jobs-only updates refresh the visible automation counter", () => {
  const node = { textContent: "" };
  const root = {
    querySelector(selector) {
      return selector === "[data-automation-stats]" ? node : null;
    }
  };
  const project = {
    id: "project-1",
    dailyLimit: 10,
    usedToday: 3,
    projectLimit: 20,
    usedTotal: 8,
    automation: {
      enabled: true,
      targetCount: 10,
      batchSize: 2,
      concurrency: 1,
      status: "running",
      lastMessage: "Собираем видео."
    }
  };
  const state = {
    jobs: [
      { projectId: "project-1", status: "done", finalVideoUrl: "/generated/final.mp4" },
      { projectId: "project-1", status: "running" },
      { projectId: "project-1", status: "running" }
    ]
  };

  updateGenerationAutomationStats(root, state, { project });

  assert.match(node.textContent, /Готово: 1\./);
  assert.match(node.textContent, /В работе: 2\./);
  assert.doesNotMatch(node.textContent, /До цели/);
  assert.match(node.textContent, /Собираем видео\./);
});
