import test from "node:test";
import assert from "node:assert/strict";
import { loadAppStateMetadata, touchAppStateMetadata } from "../scripts/app-state-metadata.mjs";

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

test("catalog metadata ignores app-state and job-only updates while refresh keeps app-state", async () => {
  let sql = "";
  await loadAppStateMetadata(async (text) => {
    sql = text;
    return { rows: [{ updated_at: "job-v2", refresh_updated_at: "audio-v2", catalog_updated_at: "catalog-v1" }] };
  }, "default");

  const refreshSql = sql.split(") as updated_at,")[1].split(") as refresh_updated_at")[0];
  const catalogSql = sql.split(") as refresh_updated_at,")[1].split(") as catalog_updated_at")[0];
  assert.match(refreshSql, /from app_state/);
  assert.doesNotMatch(refreshSql, /studio_jobs/);
  assert.doesNotMatch(catalogSql, /from app_state|studio_jobs/);
  assert.match(catalogSql, /studio_projects/);
  assert.match(catalogSql, /studio_products/);
});
