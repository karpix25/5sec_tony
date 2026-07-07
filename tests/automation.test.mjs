import test from "node:test";
import assert from "node:assert/strict";
import { products } from "../src/domain/entities.js";
import { getProjectAutomationState, normalizeProjectAutomation } from "../src/domain/project-automation.js";
import { createStore } from "../src/state/store.js";

test("automation settings normalize into safe limits", () => {
  const automation = normalizeProjectAutomation({
    enabled: true,
    targetCount: 9999,
    batchSize: 50,
    concurrency: 20
  });

  assert.equal(automation.enabled, true);
  assert.equal(automation.targetCount, 500);
  assert.equal(automation.batchSize, 10);
  assert.equal(automation.concurrency, 5);
});

test("automation state caps next batch by daily limit and active reservations", () => {
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

  const state = getProjectAutomationState({ project, jobs });

  assert.equal(state.activeJobs, 1);
  assert.equal(state.completedJobs, 2);
  assert.equal(state.remainingDaily, 2);
  assert.equal(state.remainingProject, 3);
  assert.equal(state.nextCount, 1);
  assert.equal(state.canRun, true);
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

  const state = getProjectAutomationState({ project, jobs: [] });

  assert.equal(state.remainingDaily, 8);
  assert.equal(state.remainingProject, 1);
  assert.equal(state.nextCount, 1);
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
    item.id === project.id ? { ...item, dailyLimit: 20, usedToday: 18, projectLimit: 50, usedTotal: 48 } : item
  );

  const [job] = store.createJobs(1);
  let updated = store.getState().projects.find((item) => item.id === project.id);
  assert.equal(updated.usedToday, 18);
  assert.equal(updated.usedTotal, 48);

  store.patchJob(job.id, { status: "failed", failMsg: "provider error" });
  updated = store.getState().projects.find((item) => item.id === project.id);
  assert.equal(updated.usedToday, 18);
  assert.equal(updated.usedTotal, 48);

  store.patchJob(job.id, { status: "done", finalVideoUrl: "/generated/final.mp4" });
  updated = store.getState().projects.find((item) => item.id === project.id);
  const countedJob = store.getState().jobs.find((item) => item.id === job.id);
  assert.equal(updated.usedToday, 19);
  assert.equal(updated.usedTotal, 49);
  assert.ok(countedJob.quotaCountedAt);

  store.patchJob(job.id, { progress: 100, diskStatus: "done" });
  updated = store.getState().projects.find((item) => item.id === project.id);
  assert.equal(updated.usedToday, 19);
  assert.equal(updated.usedTotal, 49);
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
