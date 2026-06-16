import test from "node:test";
import assert from "node:assert/strict";
import { createStatePersistence } from "../src/state/state-persistence.js";

test("hydrate waits for dirty form to settle before replacing remote state", async () => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  const replaceCalls = [];
  const statusUpdates = [];

  const controls = [
    { matches: (selector) => selector === "input, textarea, select, [contenteditable='true']" },
    { matches: () => false, value: "dirty", defaultValue: "", checked: false, defaultChecked: false, files: [] }
  ];
  globalThis.document = {
    activeElement: controls[0],
    querySelectorAll: () => [controls[1]]
  };
  globalThis.setTimeout = (callback) => originalSetTimeout(callback, 0);
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ state: { selectedProjectId: "remote-project", jobs: [], projects: [], products: [] }, updatedAt: "2026-06-16T12:00:00.000Z" })
  });

  const persistence = createStatePersistence({
    getState: () => ({ selectedProjectId: "local-project" }),
    replaceState: (state) => replaceCalls.push(state),
    notifyStatus: (status) => statusUpdates.push(status)
  });

  try {
    const pending = persistence.hydrate();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(replaceCalls.length, 0);

    globalThis.document.activeElement = null;
    controls[1].value = "";

    await pending;
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(replaceCalls.length, 1);
    assert.equal(replaceCalls[0].selectedProjectId, "remote-project");
    assert.equal(statusUpdates.at(-1).status, "saved");
  } finally {
    delete globalThis.document;
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
  }
});

test("scheduleSave stays inert before hydrate and saves after remote state is ready", async () => {
  const originalFetch = globalThis.fetch;
  const saveBodies = [];
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes("/api/state") && (!options.method || options.method === "GET")) {
      return { ok: true, json: async () => ({ state: null, updatedAt: "" }) };
    }
    saveBodies.push(JSON.parse(options.body));
    return { ok: true, json: async () => ({ saved: true, updatedAt: "2026-06-16T12:05:00.000Z" }) };
  };

  const persistence = createStatePersistence({
    getState: () => ({ selectedProjectId: "project", jobs: [] }),
    replaceState: () => {},
    notifyStatus: () => {}
  });

  try {
    persistence.scheduleSave();
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(saveBodies.length, 0);

    await persistence.hydrate();
    await new Promise((resolve) => setTimeout(resolve, 750));
    assert.equal(saveBodies.length, 1);
    assert.equal(saveBodies[0].state.selectedProjectId, "project");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
