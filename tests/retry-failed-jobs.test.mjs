import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { createRetryFailedJobsApiHandler, retryFailedJobs } from "../scripts/retry-failed-jobs.mjs";

test("retry failed jobs is scoped, idempotent and preserves provider error history", async () => {
  const rows = [failedRow("job-1", "batch-1"), failedRow("job-other", "batch-2")];
  const updates = [];
  const events = [];
  const dispatched = [];
  const result = await retryFailedJobs({ projectId: "project-1", batchId: "batch-1" }, {
    maxManualRetries: 3,
    withTransaction: async (callback) => callback({ query: async (text, params = []) => {
      if (/select \* from studio_jobs/i.test(text)) return { rows: rows.filter((row) => row.project_id === params[1] && row.extra.serverBatchId === params[2]) };
      if (/update studio_jobs/i.test(text)) { updates.push(params); return { rows: [] }; }
      if (/insert into studio_job_queue_events/i.test(text)) { events.push(params); return { rows: [] }; }
      return { rows: [] };
    }}),
    dispatch: async (job) => { dispatched.push(job.id); return { mode: "bullmq", enqueued: true }; }
  });

  assert.equal(result.matched, 1);
  assert.deepEqual(dispatched, ["job-1"]);
  assert.equal(updates.length, 1);
  const extra = JSON.parse(updates[0][2]);
  assert.equal(extra.manualRetryCount, 1);
  assert.equal(extra.retryHistory[0].message, "provider balance");
  assert.equal(events.length, 1);
  assert.equal(result.jobs[0].queueStatus, "queued");
});

test("retry failed jobs does nothing after the manual retry limit", async () => {
  let dispatched = 0;
  const result = await retryFailedJobs({ projectId: "project-1", batchId: "batch-1" }, {
    maxManualRetries: 2,
    withTransaction: async (callback) => callback({ query: async (text, params = []) => {
      if (/select \* from studio_jobs/i.test(text)) return { rows: [] };
      return { rows: [] };
    }}),
    dispatch: async () => { dispatched += 1; return { enqueued: true }; }
  });
  assert.equal(result.matched, 0);
  assert.equal(dispatched, 0);
});

test("retry failed brief placeholders after a rejected AI brief", async () => {
  const row = { ...failedRow("job-brief", "batch-brief"), stage: "brief", queue_name: "generation-brief-v2", extra: {
    serverBatchId: "batch-brief",
    serverOwned: true,
    isBriefPlaceholder: true,
    failMsg: "Тема не прошла проверку"
  } };
  const dispatched = [];
  const result = await retryFailedJobs({ projectId: "project-1", batchId: "batch-brief" }, {
    maxManualRetries: 3,
    withTransaction: async (callback) => callback({ query: async (text, params = []) => {
      if (/select \* from studio_jobs/i.test(text)) return { rows: [row] };
      return { rows: [] };
    }}),
    dispatch: async (job) => { dispatched.push(job.id); return { enqueued: true }; }
  });

  assert.equal(result.matched, 1);
  assert.deepEqual(dispatched, ["job-brief"]);
  assert.equal(result.jobs[0].queueStatus, "queued");
});

test("retry API rejects missing project and queue-disabled requests", async () => {
  const handle = createRetryFailedJobsApiHandler({ isPostgresConfigured: () => true, shouldUseBullMq: () => false });
  assert.equal((await call(handle, { })).status, 503);
  const queueHandle = createRetryFailedJobsApiHandler({ isPostgresConfigured: () => true, shouldUseBullMq: () => true });
  assert.equal((await call(queueHandle, { })).status, 400);
});

function failedRow(id, batchId) {
  return {
    id,
    project_id: "project-1",
    product_id: "product-1",
    character_id: "character-1",
    status: "failed",
    stage: "image",
    progress: 100,
    title: id,
    topic: "topic",
    music: "music",
    prompt: "prompt",
    output_type: "final-video",
    queue_name: "generation",
    queue_status: "failed",
    queue_priority: 0,
    queue_attempts: 3,
    queue_max_attempts: 3,
    queue_idempotency_key: `generation:${id}`,
    queue_metadata: {},
    queue_last_error: "provider balance",
    extra: { serverBatchId: batchId, serverOwned: true }
  };
}

async function call(handle, body) {
  const request = Readable.from([JSON.stringify(body)]);
  request.method = "POST";
  request.headers = {};
  const response = {
    status: 200,
    data: "",
    writeHead(status) { this.status = status; },
    end(data) { this.data = data || ""; }
  };
  await handle(request, response, new URL("http://local/api/jobs/retry-failed"));
  return { status: response.status, payload: response.data ? JSON.parse(response.data) : {} };
}
