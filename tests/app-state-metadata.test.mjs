import test from "node:test";
import assert from "node:assert/strict";
import { touchAppStateMetadata } from "../scripts/app-state-metadata.mjs";

test("touchAppStateMetadata updates an existing app state row", async () => {
  const calls = [];
  const result = await touchAppStateMetadata(async (text, params) => {
    calls.push([text, params]);
    return { rows: [{ updated_at: "t1" }] };
  }, "default");

  assert.equal(result.rows[0].updated_at, "t1");
  assert.equal(calls.length, 1);
  assert.match(calls[0][0], /^update app_state/);
});

test("touchAppStateMetadata creates metadata when the row is missing", async () => {
  const calls = [];
  const result = await touchAppStateMetadata(async (text, params) => {
    calls.push([text, params]);
    return calls.length === 1 ? { rows: [] } : { rows: [{ updated_at: "t1" }] };
  }, "default");

  assert.equal(result.rows[0].updated_at, "t1");
  assert.equal(calls.length, 2);
  assert.match(calls[1][0], /^insert into app_state/);
});
