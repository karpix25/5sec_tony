import test from "node:test";
import assert from "node:assert/strict";
import { createStateApiHandler } from "../scripts/state-api.mjs";

test("state save uses compact job reads for conflict and parity checks", async () => {
  const loadOptions = [];
  const saveOptions = [];
  const state = {
    projects: [],
    products: [],
    jobs: [{ id: "job-1", prompt: "large prompt", serverJobContext: { large: true } }]
  };
  const response = createJsonResponse();
  const handleStateApi = createStateApiHandler({
    isPostgresConfigured: () => true,
    loadNormalizedState: async (_query, _key, options) => {
      loadOptions.push(options);
      return options?.compactJobs
        ? { ...state, jobs: state.jobs.map((job) => ({ ...job, prompt: "" })) }
        : state;
    },
    saveNormalizedState: async (_query, _key, _nextState, options) => {
      saveOptions.push(options);
      return state;
    },
    touchAppStateMetadata: async () => ({ rows: [{ updated_at: "t1" }] }),
    withPostgresTransaction: async (callback) => callback({ query: async () => ({ rows: [{ updated_at: "t0" }] }) })
  });

  await handleStateApi(createJsonRequest("POST", { state, baseUpdatedAt: "t0" }), response, new URL("http://localhost/api/state"));

  assert.equal(response.status, 200);
  assert.deepEqual(loadOptions, [{ compactJobs: true }, { compactJobs: true }]);
  assert.deepEqual(saveOptions, [{ preserveCatalog: true }]);
});

function createJsonRequest(method, payload) {
  return {
    method,
    on(event, callback) {
      if (event === "data") callback(JSON.stringify(payload));
      if (event === "end") callback();
    }
  };
}

function createJsonResponse() {
  return {
    status: 0,
    payload: null,
    writeHead(status) {
      this.status = status;
    },
    end(body) {
      this.payload = JSON.parse(body);
    }
  };
}
