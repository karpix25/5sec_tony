import test from "node:test";
import assert from "node:assert/strict";
import { createStatePersistence } from "../src/state/state-persistence.js";

test("bootstrap renders the catalog before loading jobs page by page", async () => {
  const originalFetch = globalThis.fetch;
  const replaceCalls = [];
  let currentState = { projects: [], products: [], jobs: [] };

  globalThis.fetch = async (url) => {
    if (url === "/api/state") {
      return { ok: true, json: async () => ({
        state: { projects: [{ id: "saved-project" }], products: [], jobs: [] },
        jobsDeferred: true,
        updatedAt: "t1"
      }) };
    }
    if (String(url).startsWith("/api/state/jobs")) {
      return { ok: true, json: async () => ({ jobs: [{ id: "job-1" }], nextOffset: 1, hasMore: false, total: 1 }) };
    }
    throw new Error(`unexpected ${url}`);
  };

  const persistence = createStatePersistence({
    getState: () => currentState,
    replaceState: (state) => {
      currentState = state;
      replaceCalls.push(state);
    },
    notifyStatus: () => {},
    refreshIntervalMs: 0
  });

  try {
    await persistence.hydrate();
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(replaceCalls[0].projects[0].id, "saved-project");
    assert.deepEqual(replaceCalls.at(-1).jobs, [{ id: "job-1" }]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
