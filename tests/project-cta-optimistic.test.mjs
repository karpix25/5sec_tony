import test from "node:test";
import assert from "node:assert/strict";
import { createInitialState } from "../src/state/initial-state.js";
import { createStore } from "../src/state/store.js";

test("remote cta overlay changes are visible before the database responds", async () => {
  const originalFetch = globalThis.fetch;
  const remoteState = createInitialState();
  const selectedProjectId = remoteState.selectedProjectId;
  let releasePatch;
  globalThis.fetch = async (url, options = {}) => {
    if (url === "/api/state" && (!options.method || options.method === "GET")) {
      return jsonResponse({ state: remoteState, updatedAt: "t0" });
    }
    if (url === `/api/projects/${selectedProjectId}/cta-overlay` && options.method === "PATCH") {
      await new Promise((resolve) => { releasePatch = resolve; });
      return jsonResponse({ saved: true, project: remoteState.projects.find((item) => item.id === selectedProjectId), updatedAt: "t1" });
    }
    return jsonResponse({ error: `unexpected ${url}` }, 500);
  };

  try {
    const store = createStore();
    await store.whenHydrated();
    const pending = store.updateProjectCtaOverlay({ enabled: false, mode: "text" });
    await wait(0);

    const project = store.getState().projects.find((item) => item.id === selectedProjectId);
    assert.equal(project.ctaOverlay.enabled, false);
    assert.equal(project.ctaOverlay.mode, "text");
    releasePatch();
    await pending;
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
