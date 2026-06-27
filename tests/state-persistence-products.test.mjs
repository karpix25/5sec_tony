import test from "node:test";
import assert from "node:assert/strict";
import { createStatePersistence } from "../src/state/state-persistence.js";

test("pending product creation replay keeps existing db products", async () => {
  const remoteState = createState(["product-1", "product-2"]);
  const pendingState = createState(["product-3", "product-1", "product-2"]);
  let currentState = null;
  const saveBodies = [];
  const restoreFetch = installFetch(async (_url, options = {}) => {
    if (!options.method || options.method === "GET") {
      return jsonResponse({ state: remoteState, updatedAt: "2026-06-27T10:00:00.000Z" });
    }
    saveBodies.push(JSON.parse(options.body));
    return jsonResponse({ saved: true, updatedAt: "2026-06-27T10:01:00.000Z" });
  });

  try {
    const persistence = createStatePersistence({
      getState: () => currentState,
      replaceState: (state) => {
        currentState = state;
      },
      notifyStatus: () => {},
      getPendingRemoteSave: () => ({
        baseUpdatedAt: "2026-06-27T10:00:00.000Z",
        state: pendingState
      }),
      savePendingRemoteSave: () => {},
      clearPendingRemoteSave: () => {}
    });

    await persistence.hydrate();
    await waitForTimers();

    assert.deepEqual(currentState.products.map((product) => product.id), ["product-3", "product-1", "product-2"]);
    assert.equal(saveBodies.length, 1);
    assert.equal(saveBodies[0].baseUpdatedAt, "2026-06-27T10:00:00.000Z");
    assert.deepEqual(saveBodies[0].state.products.map((product) => product.id), ["product-3", "product-1", "product-2"]);
  } finally {
    restoreFetch();
  }
});

test("stale pending product deletion replay is cleared without save", async () => {
  const remoteState = createState(["product-1", "product-2"]);
  const pendingDeletionState = { ...createState(["product-1"]), deletedProductIds: ["product-2"] };
  let currentState = null;
  let clearCount = 0;
  const saveBodies = [];
  const restoreFetch = installFetch(async (_url, options = {}) => {
    if (!options.method || options.method === "GET") {
      return jsonResponse({ state: remoteState, updatedAt: "2026-06-27T10:05:00.000Z" });
    }
    saveBodies.push(JSON.parse(options.body));
    return jsonResponse({ saved: true, updatedAt: "2026-06-27T10:06:00.000Z" });
  });

  try {
    const persistence = createStatePersistence({
      getState: () => currentState,
      replaceState: (state) => {
        currentState = state;
      },
      notifyStatus: () => {},
      getPendingRemoteSave: () => ({
        baseUpdatedAt: "2026-06-27T10:00:00.000Z",
        state: pendingDeletionState
      }),
      savePendingRemoteSave: () => {},
      clearPendingRemoteSave: () => {
        clearCount += 1;
      }
    });

    await persistence.hydrate();
    await waitForTimers();

    assert.deepEqual(currentState.products.map((product) => product.id), ["product-1", "product-2"]);
    assert.equal(clearCount, 1);
    assert.deepEqual(saveBodies, []);
  } finally {
    restoreFetch();
  }
});

function createState(productIds) {
  return {
    projects: [{ id: "project-1" }],
    products: productIds.map((id) => ({ id, projectId: "project-1", name: id })),
    jobs: []
  };
}

function installFetch(handler) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = handler;
  return () => {
    globalThis.fetch = originalFetch;
  };
}

function jsonResponse(payload, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  });
}

function waitForTimers() {
  return new Promise((resolve) => setTimeout(resolve, 20));
}
