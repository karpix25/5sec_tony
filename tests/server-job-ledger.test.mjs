import test from "node:test";
import assert from "node:assert/strict";

import { dispatchJobToQueue, shouldUseBullMq, toBullMqJobId } from "../scripts/job-queue-dispatcher.mjs";
import { appendJobQueueEvent } from "../scripts/job-ledger-events.mjs";
import {
  claimNextQueuedJob,
  claimQueuedJobById,
  enqueueJobLedgerRecord,
  markJobWorkerFailure,
  patchJobLedgerRecord,
  requeueExpiredJobLocks
} from "../scripts/job-ledger-store.mjs";

test("job queue dispatcher stays inline unless BullMQ mode and Redis are configured", () => {
  assert.equal(shouldUseBullMq({ JOB_QUEUE_MODE: "inline", REDIS_URL: "redis://localhost:6379" }), false);
  assert.equal(shouldUseBullMq({ JOB_QUEUE_MODE: "bullmq" }), false);
  assert.equal(shouldUseBullMq({ JOB_QUEUE_MODE: "bullmq", REDIS_URL: "redis://localhost:6379" }), true);
});

test("job queue dispatcher enqueues BullMQ job with stable id", async () => {
  const added = [];
  const closed = [];
  const result = await dispatchJobToQueue(
    { id: "job-dispatch", queueIdempotencyKey: "stable-key", queueMaxAttempts: 5 },
    {
      env: { JOB_QUEUE_MODE: "bullmq", REDIS_URL: "redis://localhost:6379" },
      BullMQ: {
        Queue: class FakeQueue {
          constructor(name, options) {
            this.name = name;
            this.options = options;
          }
          async add(name, payload, options) {
            added.push({ queueName: this.name, name, payload, options, connection: this.options.connection });
          }
          async close() {
            closed.push(this.name);
          }
        }
      }
    }
  );

  assert.deepEqual(result, { mode: "bullmq", enqueued: true });
  assert.equal(added[0].queueName, "generation");
  assert.equal(added[0].payload.jobId, "job-dispatch");
  assert.equal(added[0].options.jobId, toBullMqJobId("stable-key"));
  assert.equal(added[0].options.jobId.includes(":"), false);
  assert.equal(added[0].options.attempts, 5);
  assert.deepEqual(added[0].options.backoff, { type: "exponential", delay: 15000 });
  assert.equal(added[0].connection.url, "redis://localhost:6379");
  assert.deepEqual(closed, ["generation"]);
});

test("job ledger enqueue updates only queue fields and appends event", async () => {
  const queries = [];
  const queued = await enqueueJobLedgerRecord(
    { id: "job-ledger", queuePriority: 7 },
    { project: { id: "project-1" } },
    {
      isPostgresConfigured: () => true,
      withPostgresTransaction: async (callback) => callback({ query: createLedgerQueryRecorder(queries) })
    }
  );
  const update = queries.find(({ text }) => /update studio_jobs set/i.test(text));
  const insert = queries.find(({ text }) => /insert into studio_job_queue_events/i.test(text));

  assert.equal(queued.id, "job-ledger");
  assert.match(update.text, /queue_status/);
  assert.match(update.text, /queue_metadata/);
  assert.doesNotMatch(update.text, /\b(app_state|studio_projects|studio_products)\b/i);
  assert.ok(insert);
});

test("job ledger claim uses Postgres row locking for parallel workers", async () => {
  const queries = [];
  const claimed = await claimNextQueuedJob("worker-1", {
    isPostgresConfigured: () => true,
    withPostgresTransaction: async (callback) => callback({ query: createLedgerQueryRecorder(queries) })
  });
  const select = queries.find(({ text }) => /for update skip locked/i.test(text));

  assert.equal(claimed.id, "job-ledger");
  assert.ok(select);
  assert.match(select.text, /queue_status in \('queued', 'retrying'\)/);
});

test("job ledger claims a specific BullMQ delivered job id with row lock", async () => {
  const queries = [];
  const claimed = await claimQueuedJobById("job-ledger", "worker-1", {
    isPostgresConfigured: () => true,
    withPostgresTransaction: async (callback) => callback({ query: createLedgerQueryRecorder(queries) })
  });
  const select = queries.find(({ text, params }) => /and id = \$2/i.test(text) && params.includes("job-ledger"));

  assert.equal(claimed.id, "job-ledger");
  assert.match(select.text, /for update skip locked/i);
  assert.match(select.text, /queue_status in \('queued', 'retrying'\)/);
});

test("job ledger patch maps terminal job status to completed queue status", async () => {
  const queries = [];
  const patched = await patchJobLedgerRecord(
    { id: "job-ledger", status: "done", stage: "export", progress: 100 },
    {
      isPostgresConfigured: () => true,
      withPostgresTransaction: async (callback) => callback({ query: createLedgerQueryRecorder(queries) })
    }
  );
  const update = queries.find(({ text, params }) => /update studio_jobs set/i.test(text) && params.includes("completed"));

  assert.equal(patched, true);
  assert.ok(update);
});

test("job ledger patch preserves explicit queued status before worker claim", async () => {
  const queries = [];
  const patched = await patchJobLedgerRecord(
    { id: "job-ledger", status: "running", queueStatus: "queued", stage: "image", progress: 18 },
    {
      isPostgresConfigured: () => true,
      withPostgresTransaction: async (callback) => callback({ query: createLedgerQueryRecorder(queries) })
    }
  );
  const update = queries.find(({ text, params }) => /update studio_jobs set/i.test(text) && params.includes("queued"));

  assert.equal(patched, true);
  assert.ok(update);
  assert.equal(update.params.includes("running"), false);
});

test("job ledger marks worker failure as retrying before max attempts", async () => {
  const queries = [];
  const failed = await markJobWorkerFailure("job-ledger", new Error("provider down"), {
    isPostgresConfigured: () => true,
    retryDelayMs: 1000,
    withPostgresTransaction: async (callback) => callback({ query: createLedgerQueryRecorder(queries, { attempts: 1, maxAttempts: 3 }) })
  });
  const update = queries.find(({ text, params }) => /update studio_jobs set/i.test(text) && params.includes("retrying"));

  assert.equal(failed.retryable, true);
  assert.equal(failed.queueStatus, "retrying");
  assert.ok(update);
});

test("job ledger requeues expired worker locks without deleting jobs", async () => {
  const queries = [];
  const count = await requeueExpiredJobLocks({
    isPostgresConfigured: () => true,
    lockTimeoutMs: 900000,
    withPostgresTransaction: async (callback) => callback({ query: async (text, params = []) => {
      queries.push({ text, params });
      if (/update studio_jobs/i.test(text)) return { rows: [], rowCount: 2 };
      return { rows: [] };
    } })
  });
  const update = queries.find(({ text }) => /update studio_jobs/i.test(text));

  assert.equal(count, 2);
  assert.match(update.text, /queue_status = case/i);
  assert.doesNotMatch(update.text, /\b(delete|truncate|drop)\b/i);
});


test("job queue event insert is append-only", async () => {
  const queries = [];
  const eventId = await appendJobQueueEvent(async (text, params = []) => {
    queries.push({ text, params });
    return { rows: [] };
  }, {
    eventId: "event-1",
    jobId: "job-event",
    queueName: "generation",
    type: "accepted",
    status: "queued"
  });

  assert.equal(eventId, "event-1");
  assert.match(queries[0].text, /insert into studio_job_queue_events/i);
  assert.doesNotMatch(queries[0].text, /\b(update|delete|truncate|drop)\b/i);
});

function createLedgerQueryRecorder(queries, options = {}) {
  let loadCount = 0;
  return async function query(text, params = []) {
    queries.push({ text, params });
    if (/select id from studio_jobs/i.test(text)) return { rows: [{ id: "job-ledger" }] };
    if (/select id, queue_name/i.test(text)) {
      loadCount += 1;
      return { rows: [createLedgerRow(loadCount > 1 ? "queued" : "", options)] };
    }
    return { rows: [] };
  };
}

function createLedgerRow(queueStatus, options = {}) {
  return {
    id: "job-ledger",
    queue_name: "generation",
    queue_status: queueStatus,
    queue_priority: 7,
    queue_attempts: options.attempts ?? 0,
    queue_max_attempts: options.maxAttempts ?? 3,
    queue_provider_task_id: "",
    queue_metadata: {}
  };
}
