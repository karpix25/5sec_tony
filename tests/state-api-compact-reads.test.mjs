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

test("state save can preserve database jobs when client sends only pending reservations", async () => {
  const savedStates = [];
  const currentState = {
    projects: [{ id: "project-1" }],
    products: [{ id: "product-1", projectId: "project-1" }],
    jobs: [{ id: "old-job", status: "done" }]
  };
  const incomingState = {
    ...currentState,
    jobs: [{ id: "pending-job", status: "running", isBriefPlaceholder: true }]
  };
  let storedState = currentState;
  const response = createJsonResponse();
  const handle = createStateApiHandler({
    isPostgresConfigured: () => true,
    loadNormalizedState: async () => storedState,
    saveNormalizedState: async (_query, _key, nextState) => {
      savedStates.push(nextState);
      storedState = nextState;
      return nextState;
    },
    touchAppStateMetadata: async () => ({ rows: [{ updated_at: "t1" }] }),
    loadAppStateMetadata: async () => ({ updatedAt: "t1" }),
    withPostgresTransaction: async (callback) => callback({ query: async () => ({ rows: [{ updated_at: "t0" }] }) })
  });

  await handle(
    createJsonRequest("POST", { state: incomingState, baseUpdatedAt: "t0", preserveJobs: true }),
    response,
    new URL("http://localhost/api/state")
  );

  assert.equal(response.status, 200);
  assert.deepEqual(savedStates[0].jobs.map((job) => job.id), ["pending-job", "old-job"]);
});

test("state api bootstrap skips all jobs while keeping the catalog", async () => {
  const loadOptions = [];
  const response = createJsonResponse();
  const handle = createStateApiHandler({
    isPostgresConfigured: () => true,
    loadNormalizedState: async (_query, _key, options) => {
      loadOptions.push(options);
      return { projects: [{ id: "project-1" }], products: [{ id: "product-1" }], jobs: [{ id: "heavy-job" }] };
    },
    queryPostgres: async () => ({ rows: [{ updated_at: "t1" }] }),
    withPostgresTransaction: async () => { throw new Error("bootstrap must not open a transaction"); }
  });

  await handle({ method: "GET", headers: { "X-State-View": "bootstrap" } }, response, new URL("http://localhost/api/state"));

  assert.deepEqual(loadOptions, [{ compactJobs: true, skipJobs: true }]);
  assert.deepEqual(response.payload.state.projects, [{ id: "project-1" }]);
  assert.deepEqual(response.payload.state.products, [{ id: "product-1" }]);
  assert.deepEqual(response.payload.state.jobs, []);
  assert.equal(response.payload.jobsDeferred, true);
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
