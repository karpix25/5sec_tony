import test from "node:test";
import assert from "node:assert/strict";
import { createStateJobsApiHandler } from "../scripts/state-jobs-api.mjs";

test("state jobs api returns a bounded page without loading the catalog", async () => {
  const calls = [];
  const response = createJsonResponse();
  const handle = createStateJobsApiHandler({
    isPostgresConfigured: () => true,
    ensureStateSchema: async () => {},
    loadJobsPage: async (_query, key, options) => {
      calls.push({ key, options });
      return { jobs: [{ id: "job-2" }], total: 501, offset: 500, limit: 500, nextOffset: 501, hasMore: false };
    },
    loadAppStateMetadata: async () => ({ updatedAt: "t1" })
  });

  await handle({ method: "GET" }, response, new URL("http://localhost/api/state/jobs?offset=500&limit=9999"));

  assert.equal(response.status, 200);
  assert.deepEqual(response.payload.jobs, [{ id: "job-2" }]);
  assert.deepEqual(calls, [{ key: "default", options: { offset: 500, limit: 500 } }]);
  assert.equal(response.payload.updatedAt, "t1");
});

test("state jobs api passes project and product scope to the paged query", async () => {
  let options;
  const response = createJsonResponse();
  const handle = createStateJobsApiHandler({
    isPostgresConfigured: () => true,
    ensureStateSchema: async () => {},
    loadJobsPage: async (_query, _key, nextOptions) => {
      options = nextOptions;
      return { jobs: [], total: 0, offset: 0, limit: 15, nextOffset: 0, hasMore: false };
    },
    loadAppStateMetadata: async () => ({})
  });

  await handle({ method: "GET" }, response, new URL("http://localhost/api/state/jobs?projectId=p1&productId=x1&limit=15"));

  assert.deepEqual(options, { offset: 0, limit: 15, projectId: "p1", productId: "x1" });
});

function createJsonResponse() {
  return {
    status: 0,
    payload: null,
    writeHead(status) { this.status = status; },
    end(body) { this.payload = JSON.parse(body); }
  };
}
