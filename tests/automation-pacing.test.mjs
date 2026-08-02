import test from "node:test";
import assert from "node:assert/strict";
import { getAutomationPacing, getAutomaticParallelLimit } from "../src/domain/automation-pacing.js";

test("automation pacing spreads daily limit through the day", () => {
  const pacing = getAutomationPacing({
    dailyLimit: 100,
    usedToday: 18,
    activeJobs: 0,
    remainingProject: 500,
    now: Date.parse("2026-07-24T12:00:00.000Z")
  });

  assert.equal(pacing.targetStartedToday, 38);
  assert.equal(pacing.dueCount, 20);
  assert.equal(pacing.maxParallel, 5);
  assert.equal(pacing.nextCount, 5);
});

test("automation pacing waits when project is already ahead of schedule", () => {
  const pacing = getAutomationPacing({
    dailyLimit: 100,
    usedToday: 60,
    activeJobs: 0,
    remainingProject: 500,
    now: Date.parse("2026-07-24T12:00:00.000Z")
  });

  assert.equal(pacing.targetStartedToday, 38);
  assert.equal(pacing.nextCount, 0);
});

test("automation pacing reserves capacity for active jobs", () => {
  const pacing = getAutomationPacing({
    dailyLimit: 100,
    usedToday: 18,
    activeJobs: 4,
    remainingProject: 500,
    now: Date.parse("2026-07-24T12:00:00.000Z")
  });

  assert.equal(pacing.availableParallel, 1);
  assert.equal(pacing.nextCount, 1);
});

test("automation pacing honors configured project concurrency", () => {
  const pacing = getAutomationPacing({
    dailyLimit: 100,
    usedToday: 0,
    activeJobs: 0,
    concurrency: 2,
    remainingProject: 500,
    now: Date.parse("2026-07-24T12:00:00.000Z")
  });

  assert.equal(pacing.maxParallel, 2);
  assert.equal(pacing.nextCount, 2);
});

test("automation pacing caps each dispatch by configured batch size", () => {
  const pacing = getAutomationPacing({
    dailyLimit: 100,
    usedToday: 0,
    activeJobs: 0,
    batchSize: 1,
    concurrency: 5,
    remainingProject: 500,
    now: Date.parse("2026-07-24T12:00:00.000Z")
  });

  assert.equal(pacing.maxParallel, 5);
  assert.equal(pacing.nextCount, 1);
});

test("automatic parallel limit scales with daily limit", () => {
  assert.equal(getAutomaticParallelLimit(10), 1);
  assert.equal(getAutomaticParallelLimit(40), 2);
  assert.equal(getAutomaticParallelLimit(100), 5);
  assert.equal(getAutomaticParallelLimit(500), 5);
});
