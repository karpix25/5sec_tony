import test from "node:test";
import assert from "node:assert/strict";
import { createStateApiHandler } from "../scripts/state-api.mjs";

test("state api loads persisted state when postgres is configured", async () => {
  const queries = [];
  const handleStateApi = createStateApiHandler({
    isPostgresConfigured: () => true,
    queryPostgres: async (text, params = []) => {
      queries.push({ text, params });
      if (text.includes("select data")) {
        return {
          rows: [{
            data: { projects: [{ id: "project-1" }] },
            updated_at: "2026-06-16T10:00:00.000Z"
          }]
        };
      }
      return { rows: [] };
    }
  });

  const response = createJsonResponse();
  const handled = await handleStateApi(
    { method: "GET" },
    response,
    new URL("http://localhost/api/state")
  );

  assert.equal(handled, true);
  assert.equal(response.status, 200);
  assert.deepEqual(response.payload.state, { projects: [{ id: "project-1" }] });
  assert.equal(response.payload.updatedAt, "2026-06-16T10:00:00.000Z");
  assert.equal(queries.some((entry) => entry.text.includes("create table if not exists app_state")), true);
  assert.equal(queries.some((entry) => entry.text.includes("select data, updated_at from app_state")), true);
});

test("state api saves state when postgres is configured", async () => {
  const queries = [];
  const handleStateApi = createStateApiHandler({
    isPostgresConfigured: () => true,
    queryPostgres: async (text, params = []) => {
      queries.push({ text, params });
      if (text.includes("returning updated_at")) {
        return { rows: [{ updated_at: "2026-06-16T10:05:00.000Z" }] };
      }
      return { rows: [] };
    }
  });

  const response = createJsonResponse();
  const state = { projects: [{ id: "project-1" }], jobs: [] };
  const handled = await handleStateApi(
    createJsonRequest("POST", { state }),
    response,
    new URL("http://localhost/api/state")
  );

  assert.equal(handled, true);
  assert.equal(response.status, 200);
  assert.equal(response.payload.saved, true);
  assert.equal(response.payload.updatedAt, "2026-06-16T10:05:00.000Z");
  const insertQuery = queries.find((entry) => entry.text.includes("insert into app_state"));
  assert.ok(insertQuery);
  assert.equal(insertQuery.params[1], JSON.stringify(state));
});

test("state api rejects non-object root state payload", async () => {
  const handleStateApi = createStateApiHandler({
    isPostgresConfigured: () => true,
    queryPostgres: async () => {
      throw new Error("query should not run for invalid payload");
    }
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
