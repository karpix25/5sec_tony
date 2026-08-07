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

test("state api removes duplicate jobs during legacy migration", async () => {
  const calls = [];
  const legacyState = {
    projects: [{ id: "project-1" }],
    products: [],
    jobs: [
      { id: "job-1", title: "visible current" },
      { id: "job-1", title: "stale duplicate" }
    ]
  };
  let migratedState = null;
  const response = createJsonResponse();
  const handleStateApi = createStateApiHandler({
    isPostgresConfigured: () => true,
    loadNormalizedState: async () => {
      if (migratedState) return migratedState;
      return null;
    },
    loadLegacyState: async () => legacyState,
    saveNormalizedState: async (_query, _key, state) => {
      migratedState = state;
      calls.push(["normalized", state.jobs.map((job) => job.title)]);
    },
    saveLegacyState: async (_query, _key, state) => {
      calls.push(["legacy", state.jobs.map((job) => job.title)]);
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
  assert.deepEqual(calls, [
    ["normalized", ["visible current"]],
    ["legacy", ["visible current"]]
  ]);
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

test("state api saves relational tables and only touches app state metadata", async () => {
  const calls = [];
  const queries = [];
  const state = { projects: [{ id: "project-1" }], products: [], jobs: [] };
  const baseUpdatedAt = "2026-06-16T10:04:00.000Z";
  const response = createJsonResponse();
  const handleStateApi = createStateApiHandler({
    isPostgresConfigured: () => true,
    saveNormalizedState: async (_query, _key, nextState) => {
      calls.push(["normalized", nextState]);
    },
    saveLegacyState: async () => {
      throw new Error("POST /api/state must not rewrite the legacy snapshot");
    },
    loadNormalizedState: async () => state,
    loadAppStateMetadata: async () => ({
      updatedAt: "2026-06-16T10:05:00.000Z",
      refreshUpdatedAt: "2026-06-16T10:05:00.000Z"
    }),
    withPostgresTransaction: async (callback) => callback({
      query: async (text) => {
        queries.push(text);
        if (/select updated_at from app_state/i.test(text)) return { rows: [{ updated_at: baseUpdatedAt }] };
        if (/update app_state set updated_at/i.test(text)) return { rows: [] };
        if (/insert into app_state/i.test(text)) return { rows: [{ updated_at: "2026-06-16T10:05:00.000Z" }] };
        return { rows: [] };
      }
    })
  });

  const handled = await handleStateApi(
    createJsonRequest("POST", { state, baseUpdatedAt }),
    response,
    new URL("http://localhost/api/state")
  );

  assert.equal(handled, true);
  assert.equal(response.status, 200);
  assert.equal(response.payload.saved, true);
  assert.equal(response.payload.updatedAt, "2026-06-16T10:05:00.000Z");
  assert.equal(response.payload.refreshUpdatedAt, "2026-06-16T10:05:00.000Z");
  assert.equal(response.payload.parityOk, true);
  assert.deepEqual(calls, [["normalized", state]]);
  assert.equal(queries.filter((query) => /update app_state set updated_at/i.test(query)).length, 1);
  assert.equal(queries.filter((query) => /insert into app_state/i.test(query)).length, 1);
});

test("state api removes duplicate jobs before saving relational state", async () => {
  const calls = [];
  let savedState = null;
  const state = {
    projects: [{ id: "project-1" }],
    products: [],
    jobs: [
      { id: "job-1", title: "visible current" },
      { id: "job-1", title: "stale duplicate" }
    ]
  };
  const response = createJsonResponse();
  const handleStateApi = createStateApiHandler({
    isPostgresConfigured: () => true,
    saveNormalizedState: async (_query, _key, nextState) => {
      savedState = nextState;
      calls.push(["normalized", nextState.jobs.map((job) => job.title)]);
    },
    loadNormalizedState: async () => savedState,
    withPostgresTransaction: async (callback) => callback({
      query: async () => ({ rows: [] })
    })
  });

  await handleStateApi(
    createJsonRequest("POST", { state }),
    response,
    new URL("http://localhost/api/state")
  );

  assert.equal(response.status, 200);
  assert.deepEqual(calls, [
    ["normalized", ["visible current"]]
  ]);
});

test("state api rejects stale saves without overwriting current db state", async () => {
  const calls = [];
  const staleState = { projects: [{ id: "local-old" }], products: [], jobs: [] };
  const dbState = { projects: [{ id: "db-new" }], products: [], jobs: [] };
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
    loadNormalizedState: async () => dbState,
    loadLegacyState: async () => null,
    withPostgresTransaction: async (callback) => callback({
      query: async (text) => {
        if (/select updated_at from app_state/i.test(text)) {
          return { rows: [{ updated_at: "2026-06-16T10:05:00.000Z" }] };
        }
        return { rows: [] };
      }
    })
  });

  await handleStateApi(
    createJsonRequest("POST", {
      state: staleState,
      baseUpdatedAt: "2026-06-16T10:00:00.000Z"
    }),
    response,
    new URL("http://localhost/api/state")
  );

  assert.equal(response.status, 409);
  assert.equal(response.payload.saved, false);
  assert.equal(response.payload.conflict, true);
  assert.equal(response.payload.updatedAt, "2026-06-16T10:05:00.000Z");
  assert.deepEqual(response.payload.state, dbState);
  assert.deepEqual(calls, []);
});

test("state api rejects product loss without explicit delete action", async () => {
  const calls = [];
  const dbState = {
    projects: [{ id: "project-1" }],
    products: [
      { id: "product-1", projectId: "project-1", name: "Первый" },
      { id: "product-2", projectId: "project-1", name: "Второй" },
      { id: "product-3", projectId: "project-1", name: "Третий" }
    ],
    jobs: []
  };
  const nextState = {
    ...dbState,
    products: dbState.products.slice(0, 2)
  };
  const response = createJsonResponse();
  const handleStateApi = createStateApiHandler({
    isPostgresConfigured: () => true,
    saveNormalizedState: async (_query, _key, state) => calls.push(["normalized", state]),
    loadNormalizedState: async () => dbState,
    loadLegacyState: async () => null,
    withPostgresTransaction: async (callback) => callback({
      query: async (text) => {
        if (/select updated_at from app_state/i.test(text)) {
          return { rows: [{ updated_at: "2026-06-16T10:05:00.000Z" }] };
        }
        return { rows: [] };
      }
    })
  });

  await handleStateApi(
    createJsonRequest("POST", {
      state: nextState,
      baseUpdatedAt: "2026-06-16T10:05:00.000Z"
    }),
    response,
    new URL("http://localhost/api/state")
  );

  assert.equal(response.status, 409);
  assert.equal(response.payload.conflict, true);
  assert.match(response.payload.error, /Product deletion requires explicit delete action/);
  assert.deepEqual(response.payload.state, dbState);
  assert.deepEqual(calls, []);
});

test("state api allows product loss with explicit delete action", async () => {
  const calls = [];
  const dbState = {
    projects: [{ id: "project-1" }],
    products: [
      { id: "product-1", projectId: "project-1", name: "Первый" },
      { id: "product-2", projectId: "project-1", name: "Второй" }
    ],
    jobs: []
  };
  const nextState = {
    ...dbState,
    products: [dbState.products[0]],
    deletedProductIds: ["product-2"]
  };
  const response = createJsonResponse();
  const handleStateApi = createStateApiHandler({
    isPostgresConfigured: () => true,
    saveNormalizedState: async (_query, _key, state) => calls.push(["normalized", state.products.map((product) => product.id)]),
    saveLegacyState: async (_query, _key, state) => {
      calls.push(["legacy", state.products.map((product) => product.id)]);
      return { rows: [{ updated_at: "2026-06-16T10:06:00.000Z" }] };
    },
    loadNormalizedState: async () => nextState,
    loadLegacyState: async () => null,
    withPostgresTransaction: async (callback) => callback({
      query: async (text) => {
        if (/select updated_at from app_state/i.test(text)) {
          return { rows: [{ updated_at: "2026-06-16T10:05:00.000Z" }] };
        }
        return { rows: [] };
      }
    })
  });

  await handleStateApi(
    createJsonRequest("POST", {
      state: nextState,
      baseUpdatedAt: "2026-06-16T10:05:00.000Z"
    }),
    response,
    new URL("http://localhost/api/state")
  );

  assert.equal(response.status, 200);
  assert.deepEqual(calls, [
    ["normalized", ["product-1"]]
  ]);
});

test("state api treats missing baseUpdatedAt as conflict when db already exists", async () => {
  const calls = [];
  const dbState = { projects: [{ id: "db-current" }], products: [], jobs: [] };
  const response = createJsonResponse();
  const handleStateApi = createStateApiHandler({
    isPostgresConfigured: () => true,
    saveNormalizedState: async () => calls.push("normalized"),
    saveLegacyState: async () => calls.push("legacy"),
    loadNormalizedState: async () => dbState,
    loadLegacyState: async () => null,
    withPostgresTransaction: async (callback) => callback({
      query: async (text) => {
        if (/select updated_at from app_state/i.test(text)) {
          return { rows: [{ updated_at: "2026-06-16T10:05:00.000Z" }] };
        }
        return { rows: [] };
      }
    })
  });

  await handleStateApi(
    createJsonRequest("POST", { state: { projects: [], products: [], jobs: [] } }),
    response,
    new URL("http://localhost/api/state")
  );

  assert.equal(response.status, 409);
  assert.equal(response.payload.conflict, true);
  assert.deepEqual(response.payload.state, dbState);
  assert.deepEqual(calls, []);
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

test("state api marks audio library freshness when persisted audio library changes", async () => {
  const currentState = {
    projects: [],
    products: [],
    jobs: [],
    audioLibrary: [{ id: "audio-1", fileData: "https://cdn.example.com/old.mp3" }]
  };
  const nextState = {
    ...currentState,
    audioLibrary: [{ id: "audio-1", fileData: "https://cdn.example.com/new.mp3" }]
  };
  const marked = [];
  let savedState = currentState;
  const response = createJsonResponse();
  const handleStateApi = createStateApiHandler({
    isPostgresConfigured: () => true,
    loadNormalizedState: async () => savedState,
    saveNormalizedState: async (_query, _key, state) => {
      savedState = state;
      return state;
    },
    saveLegacyState: async () => ({ rows: [{ updated_at: "2026-06-16T10:05:00.000Z" }] }),
    markAudioLibraryUpdated: async (payload) => marked.push(payload.appStateKey),
    withPostgresTransaction: async (callback) => callback({ query: async () => ({ rows: [] }) })
  });

  await handleStateApi(
    createJsonRequest("POST", { state: nextState }),
    response,
    new URL("http://localhost/api/state")
  );

  assert.equal(response.status, 200);
  assert.deepEqual(marked, ["default"]);
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
