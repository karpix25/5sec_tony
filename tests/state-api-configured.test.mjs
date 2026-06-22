import test from "node:test";
import assert from "node:assert/strict";
import { createStateApiHandler } from "../scripts/state-api.mjs";

test("state api loads relational state when postgres is configured", async () => {
  const response = createJsonResponse();
  const handleStateApi = createStateApiHandler({
    isPostgresConfigured: () => true,
    loadNormalizedState: async () => ({ projects: [{ id: "project-1" }], jobs: [] }),
    loadLegacyState: async () => {
      throw new Error("legacy fallback should not run");
    },
    queryPostgres: async () => ({ rows: [{ updated_at: "2026-06-16T10:00:00.000Z" }] }),
    withPostgresTransaction: async () => {
      throw new Error("migration transaction should not run");
    }
  });

  const handled = await handleStateApi(
    { method: "GET" },
    response,
    new URL("http://localhost/api/state")
  );

  assert.equal(handled, true);
  assert.equal(response.status, 200);
  assert.deepEqual(response.payload.state, { projects: [{ id: "project-1" }], jobs: [] });
  assert.equal(response.payload.updatedAt, "2026-06-16T10:00:00.000Z");
  assert.equal(response.payload.source, "relational");
});

test("state api migrates legacy snapshot into normalized tables on load", async () => {
  const calls = [];
  const legacyState = { projects: [{ id: "project-1" }], products: [], jobs: [] };
  let normalizedReads = 0;
  const response = createJsonResponse();
  const handleStateApi = createStateApiHandler({
    isPostgresConfigured: () => true,
    loadNormalizedState: async () => {
      normalizedReads += 1;
      return normalizedReads === 1 ? null : legacyState;
    },
    loadLegacyState: async () => legacyState,
    saveNormalizedState: async (_query, _key, state) => {
      calls.push(["normalized", state]);
    },
    saveLegacyState: async (_query, _key, state) => {
      calls.push(["legacy", state]);
      return { rows: [{ updated_at: "2026-06-16T10:03:00.000Z" }] };
    },
    queryPostgres: async () => ({ rows: [{ updated_at: "2026-06-16T10:03:00.000Z" }] }),
    withPostgresTransaction: async (callback) => callback({ query: async () => ({ rows: [] }) })
  });

  await handleStateApi(
    { method: "GET" },
    response,
    new URL("http://localhost/api/state")
  );

  assert.equal(response.status, 200);
  assert.deepEqual(response.payload.state, legacyState);
  assert.equal(response.payload.source, "legacy");
  assert.deepEqual(calls, [["normalized", legacyState], ["legacy", legacyState]]);
});

test("state api fails legacy migration when normalized parity is broken", async () => {
  const legacyState = { projects: [{ id: "project-1" }], products: [], jobs: [] };
  const response = createJsonResponse();
  const handleStateApi = createStateApiHandler({
    isPostgresConfigured: () => true,
    loadNormalizedState: async () => null,
    loadLegacyState: async () => legacyState,
    saveNormalizedState: async () => {},
    saveLegacyState: async () => ({ rows: [{ updated_at: "2026-06-16T10:03:00.000Z" }] }),
    queryPostgres: async () => ({ rows: [] }),
    withPostgresTransaction: async (callback) => callback({ query: async () => ({ rows: [] }) })
  });

  await handleStateApi(
    { method: "GET" },
    response,
    new URL("http://localhost/api/state")
  );

  assert.equal(response.status, 500);
  assert.match(response.payload.error, /parity/i);
});

test("state api saves relational tables and legacy mirror when postgres is configured", async () => {
  const calls = [];
  const state = { projects: [{ id: "project-1" }], products: [], jobs: [] };
  const response = createJsonResponse();
  const handleStateApi = createStateApiHandler({
    isPostgresConfigured: () => true,
    saveNormalizedState: async (_query, _key, nextState) => {
      calls.push(["normalized", nextState]);
    },
    saveLegacyState: async (_query, _key, nextState) => {
      calls.push(["legacy", nextState]);
      return { rows: [{ updated_at: "2026-06-16T10:05:00.000Z" }] };
    },
    loadNormalizedState: async () => state,
    withPostgresTransaction: async (callback) => callback({ query: async () => ({ rows: [] }) })
  });

  const handled = await handleStateApi(
    createJsonRequest("POST", { state }),
    response,
    new URL("http://localhost/api/state")
  );

  assert.equal(handled, true);
  assert.equal(response.status, 200);
  assert.equal(response.payload.saved, true);
  assert.equal(response.payload.updatedAt, "2026-06-16T10:05:00.000Z");
  assert.equal(response.payload.parityOk, true);
  assert.deepEqual(calls, [["normalized", state], ["legacy", state]]);
});

test("state api save fails when relational round-trip loses data", async () => {
  const state = { projects: [{ id: "project-1" }], products: [], jobs: [] };
  const response = createJsonResponse();
  const handleStateApi = createStateApiHandler({
    isPostgresConfigured: () => true,
    saveNormalizedState: async () => {},
    saveLegacyState: async () => ({ rows: [{ updated_at: "2026-06-16T10:05:00.000Z" }] }),
    loadNormalizedState: async () => ({ projects: [], products: [], jobs: [] }),
    withPostgresTransaction: async (callback) => callback({ query: async () => ({ rows: [] }) })
  });

  await handleStateApi(
    createJsonRequest("POST", { state }),
    response,
    new URL("http://localhost/api/state")
  );

  assert.equal(response.status, 500);
  assert.match(response.payload.error, /parity/i);
});

test("state api rejects non-object root state payload", async () => {
  const handleStateApi = createStateApiHandler({
    isPostgresConfigured: () => true,
    loadNormalizedState: async () => null
  });

  const response = createJsonResponse();
  await handleStateApi(
    createJsonRequest("POST", { state: [] }),
    response,
    new URL("http://localhost/api/state")
  );

  assert.equal(response.status, 400);
  assert.deepEqual(response.payload, { error: "state object is required" });
});

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

function createJsonRequest(method, body) {
  const listeners = {};
  return {
    method,
    on(event, callback) {
      listeners[event] = callback;
      if (event === "end") {
        queueMicrotask(() => {
          listeners.data?.(JSON.stringify(body));
          listeners.end?.();
        });
      }
    }
  };
}
