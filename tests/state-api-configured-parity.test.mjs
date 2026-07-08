import test from "node:test";
import assert from "node:assert/strict";
import { defaultAppStateKey } from "../scripts/app-state-lock.mjs";
import { createStateApiHandler } from "../scripts/state-api.mjs";
import { loadLegacyState, loadNormalizedState, saveLegacyState, saveNormalizedState } from "../scripts/state-relational-store.mjs";
import { createFakeRelationalStateDb } from "./helpers/fake-relational-state-db.mjs";

test("state api saves explicit product deletion without queue filter parity failure", async () => {
  const baseUpdatedAt = "2026-06-16T10:05:00.000Z";
  const savedUpdatedAt = "2026-06-16T10:06:00.000Z";
  const db = createFakeRelationalStateDb({ updatedAt: baseUpdatedAt });
  const currentState = {
    queueProductFilter: "all",
    selectedProjectId: "project-1",
    selectedProductId: "product-1",
    projects: [{ id: "project-1", name: "Project" }],
    products: [
      { id: "product-1", projectId: "project-1", name: "First" },
      { id: "product-2", projectId: "project-1", name: "Second" }
    ],
    jobs: []
  };
  const nextState = {
    ...currentState,
    products: [currentState.products[0]],
    deletedProductIds: ["product-2"]
  };
  const handleStateApi = createStateApiHandler({
    isPostgresConfigured: () => true,
    queryPostgres: db.query,
    withPostgresTransaction: async (callback) => callback({ query: db.query }),
    loadLegacyState,
    loadNormalizedState,
    saveLegacyState,
    saveNormalizedState
  });

  await saveNormalizedState(db.query, defaultAppStateKey, currentState);
  await saveLegacyState(db.query, defaultAppStateKey, currentState);
  db.setUpdatedAt(savedUpdatedAt);

  const response = createJsonResponse();
  const handled = await handleStateApi(
    createJsonRequest("POST", { state: nextState, baseUpdatedAt }),
    response,
    new URL("http://localhost/api/state")
  );

  assert.equal(handled, true);
  assert.equal(response.status, 200);
  assert.equal(response.payload.parityOk, true);
  assert.equal(response.payload.updatedAt, savedUpdatedAt);

  const savedState = await loadNormalizedState(db.query, defaultAppStateKey);
  assert.equal(savedState.queueProductFilter, "all");
  assert.deepEqual(savedState.products.map((product) => product.id), ["product-1"]);
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
