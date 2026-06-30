import test from "node:test";
import assert from "node:assert/strict";
import { shouldScheduleRemoteSave } from "../src/state/store-persistence-policy.js";

test("remote save skips transient job-only progress patches", () => {
  const previousState = {
    jobs: [{ id: "job-1", status: "running", stage: "image", progress: 10 }]
  };
  const nextState = {
    jobs: [{ id: "job-1", status: "running", stage: "image", progress: 90 }]
  };

  const shouldSave = shouldScheduleRemoteSave(previousState, nextState, {
    jobs: nextState.jobs
  });

  assert.equal(shouldSave, false);
});

test("remote save keeps meaningful job persistence fields", () => {
  const previousState = {
    jobs: [{ id: "job-1", status: "running", stage: "image", finalVideoUrl: "" }]
  };
  const nextState = {
    jobs: [{ id: "job-1", status: "ready", stage: "final-video", finalVideoUrl: "https://cdn.example.com/final.mp4" }]
  };

  const shouldSave = shouldScheduleRemoteSave(previousState, nextState, {
    jobs: nextState.jobs
  });

  assert.equal(shouldSave, true);
});

test("remote save keeps job quota accounting fields", () => {
  const previousState = {
    jobs: [{ id: "job-1", status: "running", stage: "image", quotaCountedAt: "" }]
  };
  const nextState = {
    jobs: [{
      id: "job-1",
      status: "done",
      stage: "export",
      finalVideoUrl: "https://cdn.example.com/final.mp4",
      quotaCountedAt: "2026-06-22T10:00:00.000Z",
      quotaCountedStatus: "done"
    }]
  };

  const shouldSave = shouldScheduleRemoteSave(previousState, nextState, {
    jobs: nextState.jobs
  });

  assert.equal(shouldSave, true);
});

test("remote save keeps yandex disk public url", () => {
  const previousState = {
    jobs: [{ id: "job-1", status: "done", diskStatus: "done", diskUrl: "" }]
  };
  const nextState = {
    jobs: [{ id: "job-1", status: "done", diskStatus: "done", diskUrl: "https://disk.yandex.ru/i/final" }]
  };

  const shouldSave = shouldScheduleRemoteSave(previousState, nextState, {
    jobs: nextState.jobs
  });

  assert.equal(shouldSave, true);
});

test("remote save skips local UI selection patches", () => {
  const previousState = {
    selectedProjectId: "project-1",
    selectedProductId: "product-1",
    selectedReferenceId: "ref-1",
    selectedProjectTab: "project",
    generationBrief: { topic: "" }
  };
  const nextState = {
    selectedProjectId: "project-2",
    selectedProductId: "product-2",
    selectedReferenceId: "ref-2",
    selectedProjectTab: "queue",
    generationBrief: { topic: "" }
  };

  const shouldSave = shouldScheduleRemoteSave(previousState, nextState, {
    selectedProjectId: "project-2",
    selectedProductId: "product-2",
    selectedReferenceId: "ref-2",
    selectedProjectTab: "queue",
    generationBrief: { topic: "" }
  });

  assert.equal(shouldSave, false);
});

test("remote save keeps standalone generation brief edits", () => {
  const previousState = { generationBrief: { topic: "" } };
  const nextState = { generationBrief: { topic: "новый бриф" } };

  const shouldSave = shouldScheduleRemoteSave(previousState, nextState, {
    generationBrief: { topic: "новый бриф" }
  });

  assert.equal(shouldSave, true);
});

test("remote save keeps persisted project and product edits", () => {
  const previousState = { projects: [{ id: "project-1", name: "Old" }], products: [] };
  const nextState = { projects: [{ id: "project-1", name: "New" }], products: [{ id: "product-1" }] };

  const shouldSave = shouldScheduleRemoteSave(previousState, nextState, {
    projects: nextState.projects,
    products: nextState.products
  });

  assert.equal(shouldSave, true);
});

test("remote save still runs for mixed patches beyond jobs", () => {
  const previousState = { jobs: [] };
  const nextState = { jobs: [], selectedProjectId: "project-2" };

  const shouldSave = shouldScheduleRemoteSave(previousState, nextState, {
    jobs: [],
    selectedProjectId: "project-2"
  });

  assert.equal(shouldSave, true);
});
