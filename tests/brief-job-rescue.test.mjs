import test from "node:test";
import assert from "node:assert/strict";
import { createBriefJobStartedAt, rescueStaleBriefJobs } from "../src/state/brief-job-rescue.js";

test("stale brief placeholders are marked failed after reload", () => {
  const [job] = rescueStaleBriefJobs([
    {
      id: "brief-stuck",
      status: "running",
      stage: "brief",
      isBriefPlaceholder: true,
      progress: 3
    }
  ]);

  assert.equal(job.status, "failed");
  assert.equal(job.progress, 100);
  assert.match(job.failMsg, /AI-бриф не завершился/);
});

test("fresh brief placeholders remain active", () => {
  const now = Date.parse("2026-06-26T18:00:00.000Z");
  const [job] = rescueStaleBriefJobs([
    {
      id: "brief-fresh",
      status: "running",
      stage: "brief",
      isBriefPlaceholder: true,
      briefStartedAt: createBriefJobStartedAt(now),
      progress: 3
    }
  ], now + 30_000);

  assert.equal(job.status, "running");
  assert.equal(job.progress, 3);
});

test("server-accepted running jobs are not rescued as brief placeholders", () => {
  const old = Date.parse("2026-06-26T18:00:00.000Z");
  const [job] = rescueStaleBriefJobs([
    {
      id: "server-job",
      status: "running",
      stage: "brief",
      isBriefPlaceholder: true,
      briefStartedAt: createBriefJobStartedAt(old),
      serverJobAcceptedAt: "2026-06-26T18:01:00.000Z",
      progress: 3
    }
  ], old + 60 * 60 * 1000);

  assert.equal(job.status, "running");
  assert.equal(job.serverJobAcceptedAt, "2026-06-26T18:01:00.000Z");
});
