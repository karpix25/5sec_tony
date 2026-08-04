import test from "node:test";
import assert from "node:assert/strict";
import { recoverFailedBriefJobs } from "../scripts/recover-failed-brief-jobs.mjs";

test("recovery claims only failed brief jobs up to the limit and uses a stable queue key", async () => {
  const queries = [];
  const updates = [];
  const events = [];
  const enqueued = [];
  const rows = [failedRow("brief-1"), failedRow("brief-2")];
  const result = await recoverFailedBriefJobs({ projectId: "project-1", limit: 1 }, {
    env: { APP_STATE_KEY: "state-1", BRIEF_QUEUE_NAME: "generation-brief" },
    ensureJobQueueSchema: async () => {},
    withPostgresTransaction: async (callback) => callback({ query: async (text, params = []) => {
      queries.push({ text, params });
      if (/select \* from studio_jobs/i.test(text)) return { rows: rows.slice(0, params[2]) };
      if (/update studio_jobs/i.test(text)) { updates.push(params); return { rows: [] }; }
      if (/insert into studio_job_queue_events/i.test(text)) { events.push(params); return { rows: [] }; }
      return { rows: [] };
    }}),
    enqueueBriefJob: async (job, metadata) => {
      enqueued.push({ job, metadata });
      return { enqueued: true };
    }
  });

  assert.equal(result.matched, 1);
  assert.equal(result.queued, 1);
  assert.equal(enqueued[0].job.queueIdempotencyKey, "brief:recovery:brief-1");
  assert.equal(enqueued[0].job.queueName, "generation-brief");
  assert.equal(enqueued[0].metadata.batchId, "batch-1");
  assert.equal(updates.length, 1);
  assert.equal(JSON.parse(updates[0][5]).isBriefPlaceholder, true);
  assert.equal(events.length, 1);
  assert.match(queries.find(({ text }) => /select \* from studio_jobs/i.test(text)).text, /stage = 'brief'/);
  assert.match(queries.find(({ text }) => /select \* from studio_jobs/i.test(text)).text, /status = 'failed'/);
});

test("recovery does not enqueue a second time when the durable queue already has the key", async () => {
  let enqueueCalls = 0;
  const result = await recoverFailedBriefJobs({ limit: 5 }, {
    env: { APP_STATE_KEY: "state-1" },
    ensureJobQueueSchema: async () => {},
    withPostgresTransaction: async (callback) => callback({ query: async (text) => {
      if (/select \* from studio_jobs/i.test(text)) return { rows: [failedRow("brief-1")] };
      return { rows: [] };
    }}),
    enqueueBriefJob: async () => {
      enqueueCalls += 1;
      return { enqueued: false, existing: true };
    }
  });

  assert.equal(enqueueCalls, 1);
  assert.equal(result.queued, 0);
  assert.equal(result.recovered[0].existing, true);
  assert.equal(result.recovered[0].queueIdempotencyKey, "brief:recovery:brief-1");
});

test("recovery returns a failed job to failed when queue submission fails", async () => {
  const updates = [];
  const result = await recoverFailedBriefJobs({ limit: 1 }, {
    env: { APP_STATE_KEY: "state-1" },
    ensureJobQueueSchema: async () => {},
    withPostgresTransaction: async (callback) => callback({ query: async (text, params = []) => {
      if (/select \* from studio_jobs/i.test(text)) return { rows: [failedRow("brief-1")] };
      if (/update studio_jobs/i.test(text)) { updates.push({ text, params }); return { rows: [] }; }
      return { rows: [] };
    }}),
    enqueueBriefJob: async () => { throw new Error("Redis недоступен"); }
  });

  assert.equal(result.queued, 0);
  assert.equal(result.recovered[0].error, "Redis недоступен");
  assert.equal(updates.at(-1).params[2], "Redis недоступен");
  assert.match(updates.at(-1).text, /queue_status = 'failed'/);
});

function failedRow(id) {
  return {
    id,
    project_id: "project-1",
    product_id: "product-1",
    character_id: "character-1",
    status: "failed",
    stage: "brief",
    progress: 100,
    queue_name: "generation",
    queue_status: "failed",
    queue_max_attempts: 3,
    queue_metadata: {},
    extra: { serverBatchId: "batch-1", title: "старый бриф" }
  };
}
