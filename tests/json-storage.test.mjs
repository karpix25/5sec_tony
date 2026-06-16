import test from "node:test";
import assert from "node:assert/strict";
import { readJsonStorage, writeJsonStorage } from "../src/storage/json-storage.js";

test("json storage reads legacy raw JSON values", () => {
  const memory = createMemoryStorage();
  const restore = installStorage(memory);
  memory.setItem("legacy-key", JSON.stringify({ name: "old-state" }));

  try {
    assert.deepEqual(readJsonStorage("legacy-key", { fallback: null, version: 1 }), { name: "old-state" });
  } finally {
    restore();
  }
});

test("json storage writes versioned envelopes", () => {
  const memory = createMemoryStorage();
  const restore = installStorage(memory);

  try {
    const result = writeJsonStorage("state-key", { ok: true }, { version: 2 });
    const stored = JSON.parse(memory.getItem("state-key"));

    assert.equal(result.ok, true);
    assert.equal(stored.__storage, "anton-json-storage");
    assert.equal(stored.version, 2);
    assert.deepEqual(stored.data, { ok: true });
    assert.equal(readJsonStorage("state-key", { fallback: null, version: 2 }).ok, true);
  } finally {
    restore();
  }
});

test("json storage backs up corrupt values and returns fallback", () => {
  const memory = createMemoryStorage();
  const restore = installStorage(memory);
  const originalWarn = console.warn;
  console.warn = () => {};
  memory.setItem("broken-key", "{not-json");

  try {
    const value = readJsonStorage("broken-key", { fallback: { safe: true }, version: 1 });
    const backupKeys = memory.keys().filter((key) => key.startsWith("broken-key:corrupt:"));

    assert.deepEqual(value, { safe: true });
    assert.equal(memory.getItem("broken-key"), null);
    assert.equal(backupKeys.length, 1);
    assert.equal(memory.getItem(backupKeys[0]), "{not-json");
  } finally {
    console.warn = originalWarn;
    restore();
  }
});

function installStorage(storage) {
  const previousWindow = globalThis.window;
  globalThis.window = { localStorage: storage };
  return () => {
    if (previousWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = previousWindow;
    }
  };
}

function createMemoryStorage() {
  const items = new Map();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => items.set(key, String(value)),
    removeItem: (key) => items.delete(key),
    keys: () => [...items.keys()]
  };
}
