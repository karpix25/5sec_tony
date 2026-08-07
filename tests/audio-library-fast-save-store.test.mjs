import test from "node:test";
import assert from "node:assert/strict";
import { createInitialState } from "../src/state/initial-state.js";
import { createStore } from "../src/state/store.js";

test("remote audio upload applies uploaded assets without full state save", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const remoteState = createInitialState();
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url === "/api/state" && (!options.method || options.method === "GET")) {
      return jsonResponse({ state: remoteState, updatedAt: "t0" });
    }
    if (url === "/api/audio-library" && options.method === "POST") {
      const body = JSON.parse(options.body);
      return jsonResponse({
        saved: true,
        assets: body.assets.map((asset) => ({ ...asset, updatedAt: "t1" })),
        selectedAudioId: "audio-new",
        updatedAt: "t1"
      });
    }
    if (String(url).startsWith("/api/projects/")) {
      return jsonResponse({ saved: true, project: JSON.parse(options.body).project, updatedAt: "t2" });
    }
    if (url === "/api/state" && options.method === "POST") {
      return jsonResponse({ error: "full state save should not be used for audio upload" }, 500);
    }
    return jsonResponse({ error: `unexpected ${url}` }, 500);
  };

  try {
    const store = createStore();
    await store.whenHydrated();
    calls.length = 0;

    await store.createAudioFilesRemote([{ id: "audio-new", title: "Beat" }]);
    await wait(320);

    assert.equal(store.getState().audioLibrary[0].id, "audio-new");
    assert.equal(store.getState().selectedAudioId, "audio-new");
    assert.equal(calls.filter((call) => call.url === "/api/state" && call.options.method === "POST").length, 0);

    await store.updateProjectSettingsRemote({ name: "Проект после аудио" });
    await wait(320);
    const projectSave = calls.find((call) => String(call.url).startsWith("/api/projects/"));
    assert.equal(JSON.parse(projectSave.options.body).baseUpdatedAt, "t0");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("remote audio delete applies server selection without full state save", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const remoteState = {
    ...createInitialState(),
    audioLibrary: [
      { id: "audio-delete", title: "Delete me" },
      { id: "audio-keep", title: "Keep me" }
    ],
    selectedAudioId: "audio-delete"
  };
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url === "/api/state" && (!options.method || options.method === "GET")) {
      return jsonResponse({ state: remoteState, updatedAt: "t0" });
    }
    if (url === "/api/audio-library/audio-delete" && options.method === "DELETE") {
      return jsonResponse({
        saved: true,
        deletedAudioId: "audio-delete",
        selectedAudioId: "audio-keep",
        audioLibrary: [{ id: "audio-keep", title: "Keep me" }],
        updatedAt: "t1"
      });
    }
    if (url === "/api/state" && options.method === "POST") {
      return jsonResponse({ error: "full state save should not be used for audio delete" }, 500);
    }
    return jsonResponse({ error: `unexpected ${url}` }, 500);
  };

  try {
    const store = createStore();
    await store.whenHydrated();
    calls.length = 0;

    await store.deleteAudioRemote("audio-delete");
    await wait(320);

    assert.equal(store.getState().audioLibrary.some((audio) => audio.id === "audio-delete"), false);
    assert.equal(store.getState().selectedAudioId, "audio-keep");
    assert.equal(calls.filter((call) => call.url === "/api/state" && call.options.method === "POST").length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("remote audio batch delete uses audio endpoint without full state save", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const remoteState = {
    ...createInitialState(),
    audioLibrary: [
      { id: "audio-delete-1", title: "Delete 1" },
      { id: "audio-delete-2", title: "Delete 2" },
      { id: "audio-keep", title: "Keep me" }
    ],
    selectedAudioId: "audio-delete-1"
  };
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url === "/api/state" && (!options.method || options.method === "GET")) {
      return jsonResponse({ state: remoteState, updatedAt: "t0" });
    }
    if (url === "/api/audio-library" && options.method === "DELETE") {
      return jsonResponse({
        saved: true,
        deletedAudioIds: JSON.parse(options.body).audioIds,
        selectedAudioId: "audio-keep",
        audioLibrary: [{ id: "audio-keep", title: "Keep me" }],
        updatedAt: "t1"
      });
    }
    if (url === "/api/state" && options.method === "POST") {
      return jsonResponse({ error: "full state save should not be used for audio delete" }, 500);
    }
    return jsonResponse({ error: `unexpected ${url}` }, 500);
  };

  try {
    const store = createStore();
    await store.whenHydrated();
    calls.length = 0;

    await store.deleteAudioManyRemote(["audio-delete-1", "audio-delete-2"]);
    await wait(320);

    assert.deepEqual(store.getState().audioLibrary.map((audio) => audio.id), ["audio-keep"]);
    assert.equal(store.getState().selectedAudioId, "audio-keep");
    assert.equal(calls.filter((call) => call.url === "/api/audio-library" && call.options.method === "DELETE").length, 1);
    assert.equal(calls.filter((call) => call.url === "/api/state" && call.options.method === "POST").length, 0);
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
