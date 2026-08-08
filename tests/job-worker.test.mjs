import test from "node:test";
import assert from "node:assert/strict";
import { requeueAndRedispatchExpiredJobLocks, runPersistedJobById, startJobLockHeartbeat, startJobLockReaper } from "../scripts/job-worker.mjs";

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

test("BullMQ worker does not retry missing local disk upload source", async () => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  const persisted = [];
  let markFailureCalled = false;
  globalThis.setTimeout = (callback) => originalSetTimeout(callback, 0);
  globalThis.fetch = async (url) => {
    if (String(url).includes("/api/yandex-disk/upload")) {
      return {
        ok: false,
        json: async () => ({ error: "ENOENT: no such file or directory, open 'generated/avatar-videos/missing.mp4'" })
      };
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  try {
    await assert.rejects(() => runPersistedJobById("job-worker-missing-local", {
      claimQueuedJobById: async () => ({ id: "job-worker-missing-local" }),
      loadPersistedServerJob: async () => ({
        id: "job-worker-missing-local",
        projectId: "project-1",
        outputType: "final-video",
        finalVideoUrl: "/generated/avatar-videos/missing.mp4",
        yandexDiskRequired: true,
        diskStatus: "failed",
        queueName: "generation",
        queueStatus: "running"
      }),
      loadPersistedServerJobContext: async () => ({ project: { id: "project-1", yandexDiskFolder: "disk:/out" } }),
      persistServerJobSnapshot: async (job) => {
        persisted.push({ ...job });
        return true;
      },
      markJobWorkerFailure: async () => {
        markFailureCalled = true;
        return { queueStatus: "retrying", retryable: true };
      },
      appendJobQueueEvent: async () => {}
    }), /ENOENT/);

    assert.equal(markFailureCalled, false);
    assert.equal(persisted.at(-1).status, "failed");
    assert.equal(persisted.at(-1).queueStatus, "failed");
    assert.match(persisted.at(-1).serverJobFailedAt, /^\d{4}-\d{2}-\d{2}T/);
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

test("worker heartbeat refreshes the lock owner timestamp", async () => {
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  const timers = [];
  const calls = [];
  globalThis.setInterval = (callback, intervalMs) => {
    timers.push({ callback, intervalMs });
    return { unref() {} };
  };
  globalThis.clearInterval = () => {};

  try {
    startJobLockHeartbeat("job-heartbeat", {
      env: { JOB_LOCK_HEARTBEAT_INTERVAL_MS: "2000" },
      touchJobWorkerLock: async (...args) => calls.push(args)
    });
    assert.equal(timers[0].intervalMs, 2000);
    await timers[0].callback();
    assert.equal(calls[0][0], "job-heartbeat");
    assert.match(calls[0][1], /^worker-/);
  } finally {
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
  }
});

test("BullMQ lock reaper redispatches requeued orphan jobs", async () => {
  const dispatched = [];
  const result = await requeueAndRedispatchExpiredJobLocks({
    requeueExpiredJobLocks: async (options) => {
      await options.onRequeuedJobs([{
        id: "job-orphan",
        queueStatus: "retrying",
        queueIdempotencyKey: "generation:job-orphan",
        queueMaxAttempts: 3
      }]);
      return 1;
    },
    dispatchJobToQueue: async (job, deps) => {
      dispatched.push({ job, env: deps.env });
      return { mode: "bullmq", enqueued: true };
    }
  }, { JOB_QUEUE_MODE: "bullmq", REDIS_URL: "redis://localhost:6379" });

  assert.equal(result.count, 1);
  assert.equal(result.redispatches.length, 1);
  assert.equal(dispatched[0].job.id, "job-orphan");
  assert.equal(dispatched[0].job.queueIdempotencyKey, "generation:job-orphan");
  assert.equal(dispatched[0].job.queueMaxAttempts, 3);
});

test("BullMQ lock reaper does not redispatch terminal failed jobs", async () => {
  const dispatched = [];
  const result = await requeueAndRedispatchExpiredJobLocks({
    requeueExpiredJobLocks: async (options) => {
      await options.onRequeuedJobs([{
        id: "job-failed",
        queueStatus: "failed",
        queueIdempotencyKey: "generation:job-failed",
        queueMaxAttempts: 3
      }]);
      return 1;
    },
    dispatchJobToQueue: async (job) => {
      dispatched.push(job);
      return { mode: "bullmq", enqueued: true };
    }
  }, { JOB_QUEUE_MODE: "bullmq", REDIS_URL: "redis://localhost:6379" });

  assert.equal(result.count, 1);
  assert.equal(result.redispatches.length, 0);
  assert.equal(dispatched.length, 0);
});

test("BullMQ reconciler redispatches old queued jobs with a stable key", async () => {
  const dispatched = [];
  const result = await requeueAndRedispatchExpiredJobLocks({
    findUndispatchedQueueJobs: async () => [{
      id: "job-queued-orphan",
      queueStatus: "queued",
      queueIdempotencyKey: "generation:job-queued-orphan",
      queueMaxAttempts: 3
    }],
    requeueExpiredJobLocks: async () => 0,
    dispatchJobToQueue: async (job) => {
      dispatched.push(job);
      return { mode: "bullmq", enqueued: true };
    }
  }, { JOB_QUEUE_MODE: "bullmq", REDIS_URL: "redis://localhost:6379" });

  assert.equal(result.orphanCount, 1);
  assert.equal(result.redispatches.length, 1);
  assert.deepEqual(dispatched[0], {
    id: "job-queued-orphan",
    queueIdempotencyKey: "generation:job-queued-orphan",
    queueMaxAttempts: 3
  });
});
