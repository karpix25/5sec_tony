import test from "node:test";
import assert from "node:assert/strict";
import { noAvatarCharacterId } from "../src/domain/avatar-selection.js";
import { createInitialState } from "../src/state/initial-state.js";
import { createStore } from "../src/state/store.js";
import { getSelectionContext } from "../src/state/store-context.js";

test("selection-only store actions do not post full state to the database", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const remoteState = createInitialState();
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url === "/api/state" && (!options.method || options.method === "GET")) {
      return jsonResponse({ state: remoteState, updatedAt: "t0" });
    }
    if (url === "/api/state" && options.method === "POST") {
      return jsonResponse({ error: "selection should not use full state save" }, 500);
    }
    return jsonResponse({ error: `unexpected ${url}` }, 500);
  };

  try {
    const store = createStore();
    await store.whenHydrated();
    calls.length = 0;

    store.selectProduct("crosspay");
    store.selectProject("beauty");
    store.selectReference("beauty-grid");
    store.selectCharacter("beauty-host");
    store.selectAudio("skin-audio");
    store.selectProjectTab("queue");
    await wait(320);

    assert.equal(store.getState().selectedProductId, "serum");
    assert.equal(store.getState().selectedProjectTab, "queue");
    assert.equal(calls.filter((call) => call.url === "/api/state" && call.options.method === "POST").length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("new sessions default generation to no avatar", () => {
  const state = createInitialState();
  assert.equal(state.selectedCharacterId, noAvatarCharacterId);
});

test("project and product switches default generation to no avatar until explicitly selected", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    if (url === "/api/state" && (!options.method || options.method === "GET")) {
      return jsonResponse({ state: createInitialState(), updatedAt: "t0" });
    }
    return jsonResponse({ disabled: true }, 503);
  };

  try {
    const store = createStore();
    await store.whenHydrated();

    store.selectProject("beauty");
    assert.equal(store.getState().selectedCharacterId, noAvatarCharacterId);

    store.selectCharacter("beauty-host");
    assert.equal(store.getState().selectedCharacterId, "beauty-host");

    store.selectProduct("crosspay");
    assert.equal(store.getState().selectedCharacterId, noAvatarCharacterId);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("selection context ignores a product from another project", () => {
  const state = {
    projects: [
      { id: "project-a", name: "A", references: [{ id: "ref-a" }], characters: [] },
      { id: "project-b", name: "B", references: [{ id: "ref-b" }], characters: [] }
    ],
    products: [
      { id: "product-a", projectId: "project-a", name: "Old product" },
      { id: "product-b", projectId: "project-b", name: "Current product" }
    ],
    selectedProjectId: "project-b",
    selectedProductId: "product-a",
    selectedReferenceId: "ref-b",
    selectedCharacterId: noAvatarCharacterId,
    audioLibrary: [],
    selectedAudioId: "",
    hookLibrary: [],
    reelsResearch: [],
    generationBrief: {},
    freePrompt: ""
  };

  const context = getSelectionContext(state, (current, projectId) =>
    current.projects.find((project) => project.id === projectId) || current.projects[0]
  );

  assert.equal(context.project.id, "project-b");
  assert.equal(context.product.id, "product-b");
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
