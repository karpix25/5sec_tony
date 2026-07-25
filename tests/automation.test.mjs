import test from "node:test";
import assert from "node:assert/strict";
import { products } from "../src/domain/entities.js";
import { getProjectAutomationState, normalizeProjectAutomation } from "../src/domain/project-automation.js";
import { createStore } from "../src/state/store.js";
import { startAutomationRunnerWithOptions } from "../src/ui/automation-runner.js";

test("automation settings normalize into safe limits", () => {
  const automation = normalizeProjectAutomation({
    enabled: true,
    targetCount: 9999,
    batchSize: 50,
    concurrency: 20
  });

  assert.equal(automation.enabled, true);
  assert.equal("targetCount" in automation, false);
  assert.equal(automation.batchSize, 10);
  assert.equal(automation.concurrency, 5);
});

test("automation normalizer drops legacy completed target state", () => {
  const automation = normalizeProjectAutomation({
    enabled: false,
    targetCount: 10,
    batchSize: 1,
    concurrency: 1,
    status: "done",
    lastMessage: "Цель авторежима выполнена."
  });

  assert.equal("targetCount" in automation, false);
  assert.equal(automation.status, "idle");
  assert.equal(automation.lastMessage, "");
});

test("automation state caps next batch by daily limit, project limit and active reservations", () => {
  const project = {
    id: "auto-project",
    dailyLimit: 10,
    usedToday: 8,
    projectLimit: 12,
    usedTotal: 9,
    automation: { enabled: true, targetCount: 8, batchSize: 5, concurrency: 3 }
  };
  const jobs = [
    { projectId: project.id, status: "running" },
    { projectId: project.id, status: "done", finalVideoUrl: "/generated/one.mp4" },
    { projectId: project.id, status: "done", finalVideoUrl: "/generated/two.mp4" }
  ];

  const state = getProjectAutomationState({ project, jobs, now: Date.parse("2026-07-24T23:00:00.000Z") });

  assert.equal(state.activeJobs, 1);
  assert.equal(state.completedJobs, 2);
  assert.equal(state.remainingDaily, 2);
  assert.equal(state.remainingProject, 3);
  assert.equal(state.nextCount, 0);
  assert.equal(state.canRun, false);
});

test("automation state caps next batch by total project limit", () => {
  const project = {
    id: "auto-project-total",
    dailyLimit: 10,
    usedToday: 2,
    projectLimit: 6,
    usedTotal: 5,
    automation: { enabled: true, targetCount: 8, batchSize: 5, concurrency: 3 }
  };

  const state = getProjectAutomationState({ project, jobs: [], now: getMiddayTodayMs() });

  assert.equal(state.remainingDaily, 8);
  assert.equal(state.remainingProject, 1);
  assert.equal(state.nextCount, 1);
});

test("automation state resets stale daily usage without changing total usage", () => {
  const project = {
    id: "auto-project-new-day",
    dailyLimit: 100,
    usedToday: 100,
    dailyUsageDate: getYesterdayDateString(),
    projectLimit: 176,
    usedTotal: 90,
    automation: { enabled: true, targetCount: 10, batchSize: 5, concurrency: 3 }
  };

  const state = getProjectAutomationState({ project, jobs: [], now: getMiddayTodayMs() });

  assert.equal(state.remainingDaily, 100);
  assert.equal(state.remainingProject, 86);
  assert.equal(state.nextCount, 5);
  assert.equal(state.canRun, true);
  assert.equal(state.automation.enabled, true);
});

test("automation state respects exhausted current-day daily limit without changing enabled flag", () => {
  const project = {
    id: "auto-project-daily-exhausted",
    dailyLimit: 100,
    usedToday: 100,
    dailyUsageDate: getTodayDateString(),
    projectLimit: 176,
    usedTotal: 90,
    automation: { enabled: true, targetCount: 10, batchSize: 5, concurrency: 3 }
  };

  const state = getProjectAutomationState({ project, jobs: [], now: getMiddayTodayMs() });

  assert.equal(state.remainingDaily, 0);
  assert.equal(state.remainingProject, 86);
  assert.equal(state.nextCount, 0);
  assert.equal(state.canRun, false);
  assert.equal(state.automation.enabled, true);
});

test("automation state keeps queue errors enabled but blocked from reruns", () => {
  const project = {
    id: "auto-project-queue-error",
    dailyLimit: 10,
    usedToday: 1,
    dailyUsageDate: getTodayDateString(),
    projectLimit: 20,
    usedTotal: 2,
    automation: { enabled: true, status: "error", batchSize: 1, concurrency: 1 }
  };

  const state = getProjectAutomationState({ project, jobs: [], now: getMiddayTodayMs() });

  assert.equal(state.automation.enabled, true);
  assert.equal(state.nextCount, 1);
  assert.equal(state.canRun, false);
});

test("automation runner marks queue config errors without disabling autorun", async () => {
  let calls = 0;
  const store = createAutomationRunnerStore({
    id: "auto-runner-queue-error",
    dailyLimit: 10,
    usedToday: 0,
    dailyUsageDate: getTodayDateString(),
    projectLimit: 20,
    usedTotal: 0,
    automation: { enabled: true, status: "running" }
  });

  startAutomationRunnerWithOptions(store, {
    createServerGenerationBatch: async () => {
      calls += 1;
      const error = new Error("Серверная очередь не настроена. Авторежим не запущен.");
      error.code = "JOB_QUEUE_NOT_CONFIGURED";
      throw error;
    }
  });
  await waitForAutomationRunner();
  await waitForAutomationRunner();

  const automation = store.getState().projects[0].automation;
  assert.equal(calls, 1);
  assert.equal(automation.enabled, true);
  assert.equal(automation.status, "error");
  assert.match(automation.lastMessage, /очередь не настроена/i);
});

test("automation state ignores legacy target count when project limits have room", () => {
  const project = {
    id: "auto-project-legacy-target",
    dailyLimit: 100,
    usedToday: 10,
    projectLimit: 200,
    usedTotal: 90,
    automation: { enabled: true, targetCount: 10, batchSize: 4, concurrency: 2 }
  };
  const jobs = Array.from({ length: 90 }, (_, index) => ({
    id: `job-${index}`,
    projectId: project.id,
    status: "done",
    finalVideoUrl: `/generated/${index}.mp4`
  }));

  const state = getProjectAutomationState({ project, jobs, now: Date.parse("2026-07-24T12:00:00.000Z") });

  assert.equal(state.completedJobs, 90);
  assert.equal(state.remainingDaily, 90);
  assert.equal(state.remainingProject, 110);
  assert.equal(state.nextCount, 5);
  assert.equal(state.canRun, true);
});

test("automation runner waits at daily limit without disabling autorun", async () => {
  const store = createAutomationRunnerStore({
    id: "auto-runner-daily",
    dailyLimit: 1,
    usedToday: 1,
    dailyUsageDate: getTodayDateString(),
    projectLimit: 5,
    usedTotal: 1,
    automation: { enabled: true, status: "running" }
  });

  startAutomationRunnerWithOptions(store);
  await waitForAutomationRunner();

  const automation = store.getState().projects[0].automation;
  assert.equal(automation.enabled, true);
  assert.equal(automation.status, "waiting");
  assert.match(automation.lastMessage, /Дневной лимит/);
});

test("automation runner disables autorun when project limit is reached", async () => {
  const store = createAutomationRunnerStore({
    id: "auto-runner-project",
    dailyLimit: 10,
    usedToday: 1,
    dailyUsageDate: getTodayDateString(),
    projectLimit: 5,
    usedTotal: 5,
    automation: { enabled: true, status: "running" }
  });

  startAutomationRunnerWithOptions(store);
  await waitForAutomationRunner();

  const automation = store.getState().projects[0].automation;
  assert.equal(automation.enabled, false);
  assert.equal(automation.status, "done");
  assert.match(automation.lastMessage, /Лимит проекта/);
});

test("store creates jobs only up to unreserved project daily limit", () => {
  const store = createStore();
  const state = store.getState();
  const project = state.projects.find((item) => item.id === state.selectedProjectId);
  state.jobs = [];
  state.projects = state.projects.map((item) =>
    item.id === project.id ? { ...item, dailyLimit: 20, usedToday: 18, projectLimit: 50, usedTotal: 48 } : item
  );

  const jobs = store.createJobs(10);
  const updated = store.getState().projects.find((item) => item.id === project.id);

  assert.equal(jobs.length, 2);
  assert.equal(updated.usedToday, 18);
  assert.equal(updated.usedTotal, 48);
  assert.equal(store.createJobs(1).length, 0);
});

test("store creates jobs only up to unreserved total project limit", () => {
  const store = createStore();
  const state = store.getState();
  const project = state.projects.find((item) => item.id === state.selectedProjectId);
  state.jobs = [];
  state.projects = state.projects.map((item) =>
    item.id === project.id ? { ...item, dailyLimit: 20, usedToday: 2, projectLimit: 5, usedTotal: 4 } : item
  );

  const jobs = store.createJobs(10);
  const updated = store.getState().projects.find((item) => item.id === project.id);

  assert.equal(jobs.length, 1);
  assert.equal(updated.usedToday, 2);
  assert.equal(updated.usedTotal, 4);
  assert.equal(store.createJobs(1).length, 0);
});

test("store counts daily usage only when a job succeeds once", () => {
  const store = createStore();
  const state = store.getState();
  const project = state.projects.find((item) => item.id === state.selectedProjectId);
  state.jobs = [];
  state.projects = state.projects.map((item) =>
    item.id === project.id
      ? {
        ...item,
        dailyLimit: 20,
        usedToday: 18,
        dailyUsageDate: getYesterdayDateString(),
        projectLimit: 50,
        usedTotal: 48
      }
      : item
  );

  const [job] = store.createJobs(1);
  let updated = store.getState().projects.find((item) => item.id === project.id);
  assert.equal(updated.usedToday, 0);
  assert.equal(updated.usedTotal, 48);
  assert.equal(updated.dailyUsageDate, getTodayDateString());

  store.patchJob(job.id, { status: "failed", failMsg: "provider error" });
  updated = store.getState().projects.find((item) => item.id === project.id);
  assert.equal(updated.usedToday, 0);
  assert.equal(updated.usedTotal, 48);
  assert.equal(updated.dailyUsageDate, getTodayDateString());

  store.patchJob(job.id, { status: "done", finalVideoUrl: "/generated/final.mp4" });
  updated = store.getState().projects.find((item) => item.id === project.id);
  const countedJob = store.getState().jobs.find((item) => item.id === job.id);
  assert.equal(updated.usedToday, 0);
  assert.equal(updated.usedTotal, 48);
  assert.equal(updated.dailyUsageDate, getTodayDateString());
  assert.equal(countedJob.quotaCountedAt, undefined);

  store.patchJob(job.id, {
    progress: 100,
    diskStatus: "done",
    diskVerifiedAt: "2026-07-22T10:00:00.000Z"
  });
  updated = store.getState().projects.find((item) => item.id === project.id);
  assert.equal(updated.usedToday, 1);
  assert.equal(updated.usedTotal, 49);
  assert.equal(updated.dailyUsageDate, getTodayDateString());
});

test("store counts image-only review jobs as successful usage", () => {
  const store = createStore();
  const state = store.getState();
  const project = state.projects.find((item) => item.id === state.selectedProjectId);
  state.jobs = [];
  state.projects = state.projects.map((item) =>
    item.id === project.id ? { ...item, dailyLimit: 20, usedToday: 0, projectLimit: 50, usedTotal: 0 } : item
  );

  const [job] = store.createJobs(1);
  store.patchJob(job.id, { outputType: "image", status: "review", imageUrl: "/generated/image.png" });
  const updated = store.getState().projects.find((item) => item.id === project.id);

  assert.equal(updated.usedToday, 1);
  assert.equal(updated.usedTotal, 1);
});

test("store manual batch keeps selected product", () => {
  const store = createStore();
  const state = store.getState();
  const project = state.projects.find((item) => item.id === "supplements");
  const projectProducts = products.filter((item) => item.projectId === project.id);
  state.selectedProjectId = project.id;
  state.selectedProductId = projectProducts[1].id;
  state.jobs = [];
  state.projects = state.projects.map((item) =>
    item.id === project.id ? { ...item, dailyLimit: 20, usedToday: 0, projectLimit: 50, usedTotal: 0 } : item
  );

  const jobs = store.createJobs(4);

  assert.deepEqual(jobs.map((job) => job.productId), [
    projectProducts[1].id,
    projectProducts[1].id,
    projectProducts[1].id,
    projectProducts[1].id
  ]);
});

test("store updates project daily limit and resets daily usage", () => {
  const store = createStore();
  const state = store.getState();
  const project = state.projects.find((item) => item.id === state.selectedProjectId);
  state.projects = state.projects.map((item) =>
    item.id === project.id ? { ...item, dailyLimit: 20, usedToday: 18, projectLimit: 100, usedTotal: 44 } : item
  );

  store.updateProjectSettings({ name: project.name, dailyLimit: "7", projectLimit: "77" });
  let updated = store.getState().projects.find((item) => item.id === project.id);

  assert.equal(updated.dailyLimit, 7);
  assert.equal(updated.projectLimit, 77);
  assert.equal(updated.usedToday, 18);
  assert.equal(updated.usedTotal, 44);

  store.resetProjectDailyUsage(project.id);
  store.resetProjectTotalUsage(project.id);
  updated = store.getState().projects.find((item) => item.id === project.id);

  assert.equal(updated.usedToday, 0);
  assert.equal(updated.usedTotal, 0);
});

function getTodayDateString() {
  return formatDateString(new Date());
}

function getYesterdayDateString() {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return formatDateString(date);
}

function getMiddayTodayMs() {
  return Date.parse(`${getTodayDateString()}T12:00:00.000Z`);
}

function formatDateString(date) {
  return date.toISOString().slice(0, 10);
}

function createAutomationRunnerStore(project) {
  const state = { projects: [project], jobs: [] };
  return {
    getState: () => state,
    subscribe() {},
    updateProjectAutomation(projectId, payload) {
      state.projects = state.projects.map((item) =>
        item.id === projectId
          ? { ...item, automation: { ...(item.automation || {}), ...payload } }
          : item
      );
    }
  };
}

async function waitForAutomationRunner() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}
