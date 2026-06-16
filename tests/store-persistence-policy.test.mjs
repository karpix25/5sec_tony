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

test("remote save still runs for mixed patches beyond jobs", () => {
  const previousState = { jobs: [] };
  const nextState = { jobs: [], selectedProjectId: "project-2" };

  const shouldSave = shouldScheduleRemoteSave(previousState, nextState, {
    jobs: [],
    selectedProjectId: "project-2"
  });

  assert.equal(shouldSave, true);
});
