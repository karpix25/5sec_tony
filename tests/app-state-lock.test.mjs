import test from "node:test";
import assert from "node:assert/strict";

import { isRetryablePostgresConcurrencyError, lockAppState, withAppStateRetry } from "../scripts/app-state-lock.mjs";

test("app state lock uses a stable advisory transaction lock", async () => {
  const queries = [];
  await lockAppState(async (text, params = []) => {
    queries.push({ text, params });
    return { rows: [] };
  }, "default");

  assert.equal(queries[0].text, "select pg_advisory_xact_lock(hashtext($1))");
  assert.deepEqual(queries[0].params, ["default"]);
});

test("app state retry repeats deadlocks and serialization failures", async () => {
  let attempts = 0;
  const result = await withAppStateRetry(async () => {
    attempts += 1;
    if (attempts < 3) {
      const error = new Error("deadlock detected");
      error.code = attempts === 1 ? "40P01" : "40001";
      throw error;
    }
    return "ok";
  }, { delayMs: 0 });

  assert.equal(result, "ok");
  assert.equal(attempts, 3);
});

test("app state retry does not hide non-concurrency errors", async () => {
  assert.equal(isRetryablePostgresConcurrencyError({ code: "40P01" }), true);
  assert.equal(isRetryablePostgresConcurrencyError({ code: "23505" }), false);
  await assert.rejects(
    () => withAppStateRetry(async () => {
      const error = new Error("bad input");
      error.code = "23505";
      throw error;
    }, { delayMs: 0 }),
    /bad input/
  );
});
