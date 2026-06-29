import assert from "node:assert/strict";
import test from "node:test";

import { ensureJobQueueSchema, JOB_QUEUE_SCHEMA_DDL } from "../scripts/job-queue-schema.mjs";

const FORBIDDEN_MUTATIONS = /\b(drop|truncate|delete)\b/i;

test("job queue schema is additive-only DDL", () => {
  assert.doesNotMatch(JOB_QUEUE_SCHEMA_DDL, FORBIDDEN_MUTATIONS);
  assert.doesNotMatch(JOB_QUEUE_SCHEMA_DDL, /\balter\s+table\b(?!\s+studio_jobs\b)/i);

  const alteredColumns = [...JOB_QUEUE_SCHEMA_DDL.matchAll(/\balter\s+table\s+studio_jobs\s+add\s+column\s+if\s+not\s+exists\s+([a-z_]+)/gi)]
    .map((match) => match[1]);

  assert.deepEqual(alteredColumns, [
    "queue_name",
    "queue_status",
    "queue_priority",
    "queue_attempts",
    "queue_max_attempts",
    "queue_scheduled_at",
    "queue_locked_at",
    "queue_lock_owner",
    "queue_last_error",
    "queue_idempotency_key",
    "queue_provider_task_id",
    "queue_metadata"
  ]);
  assert.equal(alteredColumns.every((column) => column.startsWith("queue_")), true);
});

test("job queue schema adds only queue and event tables and indexes", () => {
  const createdTables = [...JOB_QUEUE_SCHEMA_DDL.matchAll(/\bcreate\s+table\s+if\s+not\s+exists\s+([a-z_]+)/gi)]
    .map((match) => match[1]);
  const createdIndexes = [...JOB_QUEUE_SCHEMA_DDL.matchAll(/\bcreate\s+(?:unique\s+)?index\s+if\s+not\s+exists\s+([a-z_]+)/gi)]
    .map((match) => match[1]);

  assert.deepEqual(createdTables, ["studio_job_queues", "studio_job_queue_events"]);
  assert.equal(createdTables.every((table) => /queue|event/.test(table)), true);
  assert.equal(createdIndexes.every((index) => /queue|event/.test(index)), true);
  assert.equal(createdIndexes.length, 6);
});

test("job queue schema table columns stay scoped to queue and event metadata", () => {
  const queueTable = extractCreateTableBody("studio_job_queues");
  const eventTable = extractCreateTableBody("studio_job_queue_events");

  assert.deepEqual(extractColumnNames(queueTable), [
    "app_state_key",
    "queue_name",
    "queue_status",
    "queue_concurrency",
    "queue_paused",
    "queue_metadata",
    "queue_created_at",
    "queue_updated_at"
  ]);
  assert.deepEqual(extractColumnNames(eventTable), [
    "app_state_key",
    "event_id",
    "job_id",
    "queue_name",
    "event_type",
    "event_status",
    "event_actor",
    "event_message",
    "event_payload",
    "event_created_at"
  ]);
  assert.doesNotMatch(eventTable, /\bforeign\s+key\b/i);
});

test("ensureJobQueueSchema sends one self-contained DDL batch", async () => {
  const queries = [];
  await ensureJobQueueSchema(async (text) => {
    queries.push(text);
    return { rows: [] };
  });

  assert.deepEqual(queries, [JOB_QUEUE_SCHEMA_DDL]);
});

function extractCreateTableBody(tableName) {
  const pattern = new RegExp(`create\\s+table\\s+if\\s+not\\s+exists\\s+${tableName}\\s+\\(([\\s\\S]*?)\\n\\s+\\);`, "i");
  const match = JOB_QUEUE_SCHEMA_DDL.match(pattern);
  assert.ok(match, `Missing create table body for ${tableName}`);
  return match[1];
}

function extractColumnNames(tableBody) {
  return tableBody
    .split("\n")
    .map((line) => line.trim().replace(/,$/, ""))
    .filter((line) => line && !/^(primary|foreign)\s+key\b/i.test(line))
    .map((line) => line.match(/^([a-z_]+)/i)?.[1])
    .filter(Boolean);
}
