import assert from "node:assert/strict";
import test from "node:test";

import { patchJobWithQuotaAccounting } from "../src/domain/job-quota.js";

test("yandex project quota waits for verified disk upload", () => {
  const state = createState({ yandexDiskFolder: "disk:/ВИДЕО/5сек/MOLEKULAR" });
  const pending = patchJobWithQuotaAccounting(state, "job-1", {
    status: "done",
    finalVideoUrl: "/generated/avatar-videos/job-1.mp4",
    diskStatus: "uploading"
  }, fixedTimestamp);

  assert.equal(pending.jobs[0].quotaCountedAt, undefined);
  assert.equal(pending.projects, undefined);

  const verified = patchJobWithQuotaAccounting(state, "job-1", {
    status: "done",
    finalVideoUrl: "https://disk.yandex.ru/i/job-1",
    diskStatus: "done",
    diskVerifiedAt: "2026-07-22T12:00:00.000Z"
  }, fixedTimestamp);

  assert.equal(verified.jobs[0].quotaCountedAt, "2026-07-22T12:30:00.000Z");
  assert.equal(verified.projects[0].usedToday, 1);
  assert.equal(verified.projects[0].usedTotal, 1);
});

test("non-yandex project keeps existing quota behavior", () => {
  const state = createState({ yandexDiskFolder: "" });
  const result = patchJobWithQuotaAccounting(state, "job-1", {
    status: "done",
    finalVideoUrl: "/generated/avatar-videos/job-1.mp4"
  }, fixedTimestamp);

  assert.equal(result.jobs[0].quotaCountedAt, "2026-07-22T12:30:00.000Z");
  assert.equal(result.projects[0].usedToday, 1);
});

function createState(projectOverrides = {}) {
  return {
    projects: [{
      id: "project-1",
      dailyLimit: 100,
      usedToday: 0,
      projectLimit: 100,
      usedTotal: 0,
      dailyUsageDate: "2026-07-22",
      ...projectOverrides
    }],
    jobs: [{
      id: "job-1",
      projectId: "project-1",
      status: "running",
      outputType: "final-video"
    }]
  };
}

function fixedTimestamp() {
  return "2026-07-22T12:30:00.000Z";
}
