import test from "node:test";
import assert from "node:assert/strict";
import { createStatePersistence } from "../src/state/state-persistence.js";

test("auto-refresh ignores job-only versions and loads full state after refresh version changes", async () => {
  const originalFetch = globalThis.fetch;
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  const calls = [];
  const replacements = [];
  let refresh;
  let updatedAt = "t0";
  let refreshUpdatedAt = "t0";
  let catalogUpdatedAt = "t0";

  globalThis.setInterval = (callback) => {
    refresh = callback;
    return { unref() {} };
  };
  globalThis.clearInterval = () => {};
  globalThis.fetch = async (url) => {
    calls.push(url);
    if (url === "/api/state/meta") return jsonResponse({ updatedAt, refreshUpdatedAt, catalogUpdatedAt });
    if (url === "/api/state") {
      return jsonResponse({ state: { selectedProjectId: updatedAt, projects: [], products: [], jobs: [] }, updatedAt, refreshUpdatedAt, catalogUpdatedAt });
    }
    return jsonResponse({ error: `unexpected ${url}` }, 500);
  };

  try {
    const persistence = createStatePersistence({
      getState: () => ({ selectedProjectId: "local" }),
      replaceState: (state) => replacements.push(state),
      notifyStatus: () => {},
      refreshIntervalMs: 1000
    });
    await persistence.hydrate();
    calls.length = 0;

    await refresh();
    assert.deepEqual(calls, ["/api/state/meta"]);

    updatedAt = "job-t1";
    await refresh();
    assert.deepEqual(calls, ["/api/state/meta", "/api/state/meta"]);

    updatedAt = "t1";
    refreshUpdatedAt = "t1";
    await refresh();
    assert.deepEqual(calls, ["/api/state/meta", "/api/state/meta", "/api/state/meta", "/api/state"]);
    assert.equal(replacements.at(-1).selectedProjectId, "t1");
    assert.equal(persistence.getRemoteCatalogUpdatedAt(), "t0");
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
  }
});

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  };
}
