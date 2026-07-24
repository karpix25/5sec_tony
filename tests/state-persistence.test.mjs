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
    assert.equal(saveBodies[0].baseUpdatedAt, "");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("save sends the hydrated db version as baseUpdatedAt", async () => {
  const originalFetch = globalThis.fetch;
  const saveBodies = [];
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes("/api/state") && (!options.method || options.method === "GET")) {
      return {
        ok: true,
        json: async () => ({
          state: { selectedProjectId: "db-project", jobs: [], projects: [], products: [] },
          updatedAt: "2026-06-16T12:00:00.000Z"
        })
      };
    }
    saveBodies.push(JSON.parse(options.body));
    return { ok: true, json: async () => ({ saved: true, updatedAt: "2026-06-16T12:05:00.000Z" }) };
  };

  const persistence = createStatePersistence({
    getState: () => ({ selectedProjectId: "local-project", jobs: [] }),
    replaceState: () => {},
    notifyStatus: () => {},
    refreshIntervalMs: 0
  });

  try {
    await persistence.hydrate();
    persistence.scheduleSave();
    await new Promise((resolve) => setTimeout(resolve, 750));

    assert.equal(saveBodies.length, 1);
    assert.equal(saveBodies[0].baseUpdatedAt, "2026-06-16T12:00:00.000Z");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("transient save abort retries without surfacing raw browser error", async () => {
  const originalFetch = globalThis.fetch;
  const saveBodies = [];
  const statusUpdates = [];
  let postAttempts = 0;
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes("/api/state") && (!options.method || options.method === "GET")) {
      return {
        ok: true,
        json: async () => ({
          state: { selectedProjectId: "db-project", jobs: [], projects: [], products: [] },
          updatedAt: "2026-06-16T12:00:00.000Z"
        })
      };
    }
    postAttempts += 1;
    if (postAttempts <= 3) {
      const error = new Error("signal is aborted without reason");
      error.name = "AbortError";
      throw error;
    }
    saveBodies.push(JSON.parse(options.body));
    return { ok: true, json: async () => ({ saved: true, updatedAt: "2026-06-16T12:05:00.000Z" }) };
  };

  const persistence = createStatePersistence({
    getState: () => ({ selectedProjectId: "local-project", jobs: [] }),
    replaceState: () => {},
    notifyStatus: (status) => statusUpdates.push(status),
    refreshIntervalMs: 0,
    transientSaveRetryDelayMs: 5
  });

  try {
    await persistence.hydrate();
    persistence.scheduleSave();
    await new Promise((resolve) => setTimeout(resolve, 1400));

    assert.equal(saveBodies.length, 1);
    assert.equal(saveBodies[0].state.selectedProjectId, "local-project");
    assert.equal(statusUpdates.some((status) => status.message === "БД отвечает медленно, повторяем сохранение"), true);
    assert.equal(statusUpdates.at(-1).status, "saved");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("scheduleSave stores a pending db save before the debounce timer fires", async () => {
  const originalFetch = globalThis.fetch;
  const pendingWrites = [];
  const saveBodies = [];
  let currentState = { selectedProjectId: "db-project", jobs: [] };
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes("/api/state") && (!options.method || options.method === "GET")) {
      return {
        ok: true,
        json: async () => ({
          state: currentState,
          updatedAt: "2026-06-16T12:00:00.000Z"
        })
      };
    }
    saveBodies.push(JSON.parse(options.body));
    return { ok: true, json: async () => ({ saved: true, updatedAt: "2026-06-16T12:05:00.000Z" }) };
  };

  const persistence = createStatePersistence({
    getState: () => currentState,
    replaceState: (state) => {
      currentState = state;
    },
    notifyStatus: () => {},
    savePendingRemoteSave: (state, baseUpdatedAt) => pendingWrites.push({ state, baseUpdatedAt }),
    refreshIntervalMs: 0
  });

  try {
    await persistence.hydrate();
    currentState = { selectedProjectId: "saved-before-reload", jobs: [] };
    persistence.scheduleSave();

    assert.equal(pendingWrites.length, 1);
    assert.equal(pendingWrites[0].state.selectedProjectId, "saved-before-reload");
    assert.equal(pendingWrites[0].baseUpdatedAt, "2026-06-16T12:00:00.000Z");
    assert.equal(saveBodies.length, 0);

    await new Promise((resolve) => setTimeout(resolve, 260));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("hydrate replays pending save after reload when postgres version is unchanged", async () => {
  const originalFetch = globalThis.fetch;
  const saveBodies = [];
  const clearCalls = [];
  const replaceCalls = [];
  let currentState = { selectedProjectId: "boot-state", jobs: [] };

  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes("/api/state") && (!options.method || options.method === "GET")) {
      return {
        ok: true,
        json: async () => ({
          state: { selectedProjectId: "db-before-pending", jobs: [], projects: [], products: [] },
          updatedAt: "2026-06-16T12:00:00.000Z"
        })
      };
    }
    saveBodies.push(JSON.parse(options.body));
    return { ok: true, json: async () => ({ saved: true, updatedAt: "2026-06-16T12:05:00.000Z" }) };
  };

  const persistence = createStatePersistence({
    getState: () => currentState,
    replaceState: (state) => {
      currentState = state;
      replaceCalls.push(state);
    },
    notifyStatus: () => {},
    getPendingRemoteSave: () => ({
      baseUpdatedAt: "2026-06-16T12:00:00.000Z",
      state: { selectedProjectId: "pending-after-refresh", jobs: [], projects: [], products: [] }
    }),
    savePendingRemoteSave: () => {},
    clearPendingRemoteSave: () => clearCalls.push(true),
    refreshIntervalMs: 0
  });

  try {
    await persistence.hydrate();
    await new Promise((resolve) => setTimeout(resolve, 10));

    assert.equal(replaceCalls.at(-1).selectedProjectId, "pending-after-refresh");
    assert.equal(saveBodies.length, 1);
    assert.equal(saveBodies[0].state.selectedProjectId, "pending-after-refresh");
    assert.equal(saveBodies[0].baseUpdatedAt, "2026-06-16T12:00:00.000Z");
    assert.equal(clearCalls.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("save conflict accepts postgres state and does not retry stale local state", async () => {
  const originalFetch = globalThis.fetch;
  const saveBodies = [];
  const replaceCalls = [];
  const statusUpdates = [];
  let currentState = { selectedProjectId: "local-stale", jobs: [] };

  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes("/api/state") && (!options.method || options.method === "GET")) {
      return {
        ok: true,
        json: async () => ({
          state: { selectedProjectId: "db-v1", jobs: [], projects: [], products: [] },
          updatedAt: "2026-06-16T12:00:00.000Z"
        })
      };
    }
    saveBodies.push(JSON.parse(options.body));
    return {
      ok: false,
      status: 409,
      json: async () => ({
        saved: false,
        conflict: true,
        state: { selectedProjectId: "db-v2", jobs: [], projects: [], products: [] },
        updatedAt: "2026-06-16T12:05:00.000Z"
      })
    };
  };

  const persistence = createStatePersistence({
    getState: () => currentState,
    replaceState: (state) => {
      currentState = state;
      replaceCalls.push(state);
    },
    notifyStatus: (status) => statusUpdates.push(status),
    refreshIntervalMs: 0
  });

  try {
    await persistence.hydrate();
    currentState = { selectedProjectId: "local-stale", jobs: [] };
    persistence.scheduleSave();
    await new Promise((resolve) => setTimeout(resolve, 750));

    assert.equal(saveBodies.length, 1);
    assert.equal(saveBodies[0].state.selectedProjectId, "local-stale");
    assert.equal(saveBodies[0].baseUpdatedAt, "2026-06-16T12:00:00.000Z");
    assert.equal(replaceCalls.at(-1).selectedProjectId, "db-v2");
    assert.equal(statusUpdates.at(-1).status, "conflict");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("save conflict replays avatar video name when remote changed another field", async () => {
  const originalFetch = globalThis.fetch;
  const saveBodies = [];
  const replaceCalls = [];
  const statusUpdates = [];
  const baseState = createStateWithAvatarVideoName("старое название", { selectedProjectId: "project" });
  const remoteConflictState = {
    ...createStateWithAvatarVideoName("старое название", { selectedProjectId: "project" }),
    products: [{ id: "product-from-other-operator" }]
  };
  let currentState = baseState;
  let saveCount = 0;

  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes("/api/state") && (!options.method || options.method === "GET")) {
      return {
        ok: true,
        json: async () => ({
          state: baseState,
          updatedAt: "2026-06-16T12:00:00.000Z"
        })
      };
    }
    saveCount += 1;
    const body = JSON.parse(options.body);
    saveBodies.push(body);
    if (saveCount === 1) {
      return {
        ok: false,
        status: 409,
        json: async () => ({
          saved: false,
          conflict: true,
          state: remoteConflictState,
          updatedAt: "2026-06-16T12:05:00.000Z"
        })
      };
    }
    return { ok: true, json: async () => ({ saved: true, updatedAt: "2026-06-16T12:06:00.000Z" }) };
  };

  const persistence = createStatePersistence({
    getState: () => currentState,
    replaceState: (state) => {
      currentState = state;
      replaceCalls.push(state);
    },
    notifyStatus: (status) => statusUpdates.push(status),
    refreshIntervalMs: 0
  });

  try {
    await persistence.hydrate();
    currentState = createStateWithAvatarVideoName("дружелюбный совет", { selectedProjectId: "project" });
    persistence.scheduleSave();
    await new Promise((resolve) => setTimeout(resolve, 750));

    assert.equal(saveBodies.length, 2);
    assert.equal(saveBodies[0].baseUpdatedAt, "2026-06-16T12:00:00.000Z");
    assert.equal(saveBodies[1].baseUpdatedAt, "2026-06-16T12:05:00.000Z");
    assert.equal(saveBodies[1].state.products[0].id, "product-from-other-operator");
    assert.equal(saveBodies[1].state.projects[0].characters[0].avatarVideos[0].name, "дружелюбный совет");
    assert.equal(replaceCalls.at(-1).projects[0].characters[0].avatarVideos[0].name, "дружелюбный совет");
    assert.equal(statusUpdates.at(-1).status, "saved");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("hydrate restores local fallback when remote state is disabled", async () => {
  const originalFetch = globalThis.fetch;
  const replaceCalls = [];
  const modeChanges = [];

  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ state: null, disabled: true })
  });

  const persistence = createStatePersistence({
    getState: () => ({ selectedProjectId: "initial" }),
    replaceState: (state) => replaceCalls.push(state),
    notifyStatus: () => {},
    getLocalFallbackState: () => ({ selectedProjectId: "fallback" }),
    onRemoteModeChange: (mode) => modeChanges.push(mode)
  });

  try {
    await persistence.hydrate();
    assert.equal(replaceCalls.length, 1);
    assert.equal(replaceCalls[0].selectedProjectId, "fallback");
    assert.deepEqual(modeChanges, ["local"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function createStateWithAvatarVideoName(name, overrides = {}) {
  return {
    selectedProjectId: "project",
    jobs: [],
    products: [],
    projects: [{
      id: "project",
      characters: [{
        id: "character",
        avatarVideos: [{
          id: "avatar-video",
          name,
          status: "ready",
          videoUrl: "https://cdn.example.com/avatar.mp4"
        }]
      }]
    }],
    ...overrides
  };
}
