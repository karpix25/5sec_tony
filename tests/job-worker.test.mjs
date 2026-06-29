import test from "node:test";
import assert from "node:assert/strict";
import { runPersistedJobById, startJobLockReaper } from "../scripts/job-worker.mjs";

test("BullMQ worker refuses to run a job that was not claimed in Postgres", async () => {
  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error("should not run provider");
  };

  try {
    await assert.rejects(() => runPersistedJobById("job-not-claimable", {
      claimQueuedJobById: async () => null
    }), /not claimable/);
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("BullMQ worker persists failed terminal job when provider pipeline throws", async () => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  const persisted = [];
  const events = [];
  globalThis.setTimeout = (callback) => originalSetTimeout(callback, 0);
  globalThis.fetch = async () => {
    throw new Error("provider unavailable");
  };

  try {
    await assert.rejects(() => runPersistedJobById("job-worker-fails", {
      claimQueuedJobById: async () => ({ id: "job-worker-fails" }),
      loadPersistedServerJob: async () => ({
        id: "job-worker-fails",
        projectId: "project-1",
        productId: "product-1",
        outputType: "image",
        prompt: "Generate",
        queueName: "generation",
        queueStatus: "running"
      }),
      loadPersistedServerJobContext: async () => ({ project: { id: "project-1" } }),
      persistServerJobSnapshot: async (job) => {
        persisted.push({ ...job });
        return true;
      },
      markJobWorkerFailure: async () => ({ queueStatus: "failed", retryable: false }),
      appendJobQueueEvent: async (query, event) => {
        events.push(event);
      }
    }), /provider unavailable/);

    assert.equal(persisted.some((job) => job.queueStatus === "running"), true);
    assert.equal(persisted.some((job) => job.status === "failed" && job.queueStatus === "failed"), true);
    assert.equal(events.some((event) => event.type === "worker_failed"), true);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
  }
});

test("job lock reaper periodically requeues expired worker locks", async () => {
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  const timers = [];
  let reaperRuns = 0;
  globalThis.setInterval = (callback, intervalMs) => {
    timers.push({ callback, intervalMs, unrefCalled: false });
    return {
      unref() {
        timers[timers.length - 1].unrefCalled = true;
      }
    };
  };
  globalThis.clearInterval = () => {};

  try {
    const timer = startJobLockReaper({
      requeueExpiredJobLocks: async () => {
        reaperRuns += 1;
      }
    }, { JOB_LOCK_REAPER_INTERVAL_MS: "250" });

    assert.ok(timer);
    assert.equal(timers.length, 1);
    assert.equal(timers[0].intervalMs, 1000);
    assert.equal(timers[0].unrefCalled, true);
    await timers[0].callback();
    assert.equal(reaperRuns, 1);
  } finally {
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
  }
});
