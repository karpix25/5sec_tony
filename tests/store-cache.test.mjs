import test from "node:test";
import assert from "node:assert/strict";
import { projects } from "../src/domain/entities.js";
import { createStore } from "../src/state/store.js";

const uiCacheKey = "anton-5-sec-ui-cache";
const legacyProjectStateKey = "anton-5-sec-state";
const localProjectStateKey = "anton-5-sec-project-state";

test("store boot uses ui cache but does not trust legacy full project state before hydrate", () => {
  const storage = createMemoryStorage();
  const restoreWindow = installStorage(storage);
  const restoreFetch = installFetch(async () => ({ ok: true, json: async () => ({ state: null, disabled: true }) }));

  storage.setItem(uiCacheKey, JSON.stringify(envelope({
    selectedProjectId: projects[1].id,
    selectedProjectTab: "queue",
    freePrompt: "мой локальный черновик"
  })));
  storage.setItem(legacyProjectStateKey, JSON.stringify(envelope({
    projects: [{ ...projects[0], id: projects[0].id, name: "Старый локальный проект" }],
    products: [],
    jobs: []
  })));

  try {
    const store = createStore();
    const state = store.getState();

    assert.equal(state.selectedProjectId, projects[1].id);
    assert.equal(state.selectedProjectTab, "queue");
    assert.equal(state.freePrompt, "мой локальный черновик");
    assert.notEqual(state.projects[0].name, "Старый локальный проект");
  } finally {
    restoreFetch();
    restoreWindow();
  }
});

test("store restores compact local project fallback when remote state is disabled", async () => {
  const storage = createMemoryStorage();
  const restoreWindow = installStorage(storage);
  const restoreFetch = installFetch(async () => ({ ok: true, json: async () => ({ state: null, disabled: true }) }));
  const fallbackProjectName = "Локальный аварийный проект";

  storage.setItem(localProjectStateKey, JSON.stringify(envelope({
    ...createFallbackState(fallbackProjectName)
  })));
  storage.setItem(uiCacheKey, JSON.stringify(envelope({
    selectedProjectTab: "queue"
  })));

  try {
    const store = createStore();
    await store.whenHydrated();
    const state = store.getState();

    assert.equal(state.projects[0].name, fallbackProjectName);
    assert.equal(state.selectedProjectTab, "queue");
  } finally {
    restoreFetch();
    restoreWindow();
  }
});

test("late remote hydrate does not overwrite product edits made right after boot", async () => {
  const storage = createMemoryStorage();
  const restoreWindow = installStorage(storage);
  const saveBodies = [];
  let releaseHydrate = null;
  const restoreFetch = installFetch((url, options = {}) => {
    if (String(url).includes("/api/state") && (!options.method || options.method === "GET")) {
      return new Promise((resolve) => {
        releaseHydrate = () => resolve({
          ok: true,
          json: async () => ({
            state: createRemoteState("Старое описание из БД"),
            updatedAt: "2026-06-17T11:00:00.000Z"
          })
        });
      });
    }
    saveBodies.push(JSON.parse(options.body));
    return Promise.resolve({
      ok: true,
      json: async () => ({ saved: true, updatedAt: "2026-06-17T11:00:02.000Z" })
    });
  });

  try {
    const store = createStore();
    await new Promise((resolve) => setTimeout(resolve, 0));
    store.updateProduct({
      description: "Мое новое описание",
      pains: "тяжело уснуть\nнервное напряжение",
      offer: "часть вечернего ритуала"
    });

    releaseHydrate();
    await store.whenHydrated();
    await new Promise((resolve) => setTimeout(resolve, 750));

    const state = store.getState();
    const product = state.products.find((item) => item.id === state.selectedProductId);

    assert.equal(product.description, "Мое новое описание");
    assert.deepEqual(product.pains, ["тяжело уснуть", "нервное напряжение"]);
    assert.equal(product.offer, "часть вечернего ритуала");
    assert.equal(saveBodies.length > 0, true);
    assert.equal(saveBodies.at(-1).state.products.find((item) => item.id === product.id).description, "Мое новое описание");
  } finally {
    restoreFetch();
    restoreWindow();
  }
});

function envelope(data) {
  return {
    __storage: "anton-json-storage",
    version: 1,
    savedAt: "2026-06-16T00:00:00.000Z",
    data
  };
}

function installStorage(storage) {
  const previousWindow = globalThis.window;
  globalThis.window = { localStorage: storage };
  return () => {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  };
}

function installFetch(handler) {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = handler;
  return () => {
    if (previousFetch === undefined) delete globalThis.fetch;
    else globalThis.fetch = previousFetch;
  };
}

function createMemoryStorage() {
  const items = new Map();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => items.set(key, String(value)),
    removeItem: (key) => items.delete(key)
  };
}

function createFallbackState(projectName) {
  return {
    projects: [{
      ...projects[0],
      name: projectName
    }],
    products: [],
    jobs: [],
    audioLibrary: [],
    selectedProjectId: projects[0].id,
    selectedProductId: "",
    selectedReferenceId: projects[0].references[0].id,
    selectedCharacterId: projects[0].characters[0].id,
    selectedAudioId: "",
    selectedProjectTab: "project",
    generationBrief: {},
    freePrompt: ""
  };
}

function createRemoteState(description) {
  return {
    projects: projects.map((project) => ({ ...project })),
    products: [
      {
        id: "magnesium",
        projectId: "supplements",
        name: "Хлорофил",
        description,
        offer: "старое позиционирование",
        components: "",
        pains: ["старый pain"],
        facts: ["старый fact"],
        forbidden: ["старый запрет"],
        references: []
      }
    ],
    jobs: [],
    audioLibrary: [],
    selectedProjectId: "supplements",
    selectedProductId: "magnesium",
    selectedReferenceId: projects[0].references[0].id,
    selectedCharacterId: projects[0].characters[0].id,
    selectedAudioId: "",
    selectedProjectTab: "product",
    generationBrief: {},
    freePrompt: ""
  };
}
