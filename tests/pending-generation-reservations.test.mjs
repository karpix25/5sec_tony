import test from "node:test";
import assert from "node:assert/strict";
import { mergePendingGenerationReservations } from "../src/state/pending-generation-reservations.js";

const now = Date.parse("2026-07-24T19:30:00.000Z");

test("fresh requested generation reservation survives remote hydration", () => {
  const localJob = createReservationJob({
    id: "job-local-requested",
    serverReservationStatus: "requested",
    briefStartedAt: "2026-07-24T19:29:30.000Z"
  });
  const remoteJob = { id: "job-remote", status: "done" };

  const result = mergePendingGenerationReservations(
    { selectedProjectId: "project", jobs: [remoteJob] },
    { jobs: [localJob] },
    { now }
  );

  assert.equal(result.preservedCount, 1);
  assert.deepEqual(result.state.jobs.map((job) => job.id), ["job-local-requested", "job-remote"]);
});

test("remote job with the same id replaces local generation reservation", () => {
  const localJob = createReservationJob({
    id: "job-adopted",
    serverReservationStatus: "requested",
    briefStartedAt: "2026-07-24T19:29:30.000Z"
  });
  const remoteJob = { id: "job-adopted", status: "running", stage: "image" };

  const result = mergePendingGenerationReservations(
    { jobs: [remoteJob] },
    { jobs: [localJob] },
    { now }
  );

  assert.equal(result.preservedCount, 0);
  assert.deepEqual(result.state.jobs, [remoteJob]);
});

test("stale generation reservation is not restored over remote state", () => {
  const localJob = createReservationJob({
    id: "job-stale",
    serverReservationStatus: "requested",
    briefStartedAt: "2026-07-24T19:10:00.000Z"
  });
  const remoteJob = { id: "job-remote", status: "done" };

  const result = mergePendingGenerationReservations(
    { jobs: [remoteJob] },
    { jobs: [localJob] },
    { now, retentionMs: 5 * 60 * 1000 }
  );

  assert.equal(result.preservedCount, 0);
  assert.deepEqual(result.state.jobs, [remoteJob]);
});

test("fresh rejected generation reservation survives remote hydration", () => {
  const localJob = createReservationJob({
    id: "job-rejected",
    status: "failed",
    serverReservationStatus: "failed",
    briefStartedAt: "2026-07-24T19:29:30.000Z"
  });

  const result = mergePendingGenerationReservations(
    { jobs: [] },
    { jobs: [localJob] },
    { now }
  );

  assert.equal(result.preservedCount, 1);
  assert.equal(result.state.jobs[0].id, "job-rejected");
});

function createReservationJob(overrides = {}) {
  return {
    id: "job-local",
    status: "running",
    stage: "brief",
    progress: 5,
    isBriefPlaceholder: true,
    serverOwned: true,
    serverReservationStatus: "requested",
    ...overrides
  };
}
