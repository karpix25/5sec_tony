import test from "node:test";
import assert from "node:assert/strict";
import {
  capturePagePosition,
  readPagePosition,
  restorePagePosition,
  savePagePosition
} from "../src/ui/page-position-state.js";

const storageKey = "anton-5-sec-page-position";

test("page position persists and restores across reload render", () => {
  const storage = createMemoryStorage();
  const calls = [];
  const restoreWindow = installWindow({
    localStorage: storage,
    scrollX: 12,
    scrollY: 640,
    requestAnimationFrame: (callback) => {
      callback();
      return 1;
    },
    scrollTo: (x, y) => calls.push({ x, y })
  });

  try {
    assert.deepEqual(capturePagePosition(window), { x: 12, y: 640 });
    assert.equal(savePagePosition(capturePagePosition(window)).ok, true);
    assert.deepEqual(readPagePosition(), { x: 12, y: 640 });

    window.scrollX = 0;
    window.scrollY = 0;
    restorePagePosition(window);

    assert.deepEqual(calls.at(-1), { x: 12, y: 640 });
    assert.ok(storage.getItem(storageKey));
  } finally {
    restoreWindow();
  }
});

function installWindow(windowPatch) {
  const previousWindow = globalThis.window;
  globalThis.window = windowPatch;
  return () => {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
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
