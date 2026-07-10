import assert from "node:assert/strict";
import test from "node:test";

let importCounter = 0;

test("ensureStateSchema marks bundled job queue schema ready", async () => {
  const { ensureStateSchema } = await importFreshStateSchema();
  const { ensureJobQueueSchema } = await import("../scripts/job-queue-schema.mjs");
  const queries = [];

  await ensureStateSchema(async (text) => {
    queries.push(text);
    return { rows: [] };
  });
  await ensureJobQueueSchema(async () => {
    throw new Error("job queue schema should be initialized by state schema");
  });

  assert.equal(queries.length, 1);
});

test("ensureStateSchema runs DDL once for sequential calls", async () => {
  const { ensureStateSchema } = await importFreshStateSchema();
  const queries = [];

  await ensureStateSchema(async (text) => {
    queries.push(text);
    return { rows: [] };
  });
  await ensureStateSchema(async () => {
    throw new Error("schema should already be initialized");
  });

  assert.equal(queries.length, 1);
  assert.match(queries[0], /create table if not exists studio_jobs/i);
  assert.match(queries[0], /alter table studio_jobs add column if not exists queue_name/i);
});

test("ensureStateSchema shares one in-flight DDL promise", async () => {
  const { ensureStateSchema } = await importFreshStateSchema();
  const queries = [];

  await Promise.all([
    ensureStateSchema(delayedQuery(queries)),
    ensureStateSchema(async () => {
      throw new Error("parallel schema call should reuse the first promise");
    })
  ]);

  assert.equal(queries.length, 1);
  assert.match(queries[0], /alter table studio_jobs add column if not exists queue_name/i);
});

test("ensureStateSchema retries after DDL failure", async () => {
  const { ensureStateSchema } = await importFreshStateSchema();
  const queries = [];
  const expectedError = new Error("DDL failed");

  await assert.rejects(
    ensureStateSchema(async (text) => {
      queries.push(text);
      throw expectedError;
    }),
    expectedError
  );

  await ensureStateSchema(async (text) => {
    queries.push(text);
    return { rows: [] };
  });

  assert.equal(queries.length, 2);
});

function delayedQuery(queries) {
  return async (text) => {
    queries.push(text);
    await new Promise((resolve) => setTimeout(resolve, 10));
    return { rows: [] };
  };
}

async function importFreshStateSchema() {
  importCounter += 1;
  return import(`../scripts/state-schema.mjs?cache=${importCounter}`);
}
