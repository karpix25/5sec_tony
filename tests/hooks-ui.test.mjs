import test from "node:test";
import assert from "node:assert/strict";
import { renderHooksPanel, bindHooksEvents } from "../src/ui/hooks.js";

test("hooks panel shows empty helper when no active hooks or draft", () => {
  const html = renderHooksPanel();

  assert.match(html, /Добавить список хуков/);
  assert.match(html, /генератор начал использовать ваши референсы хуков/i);
});

test("parse hook text event builds a draft and enables apply action after refresh", () => {
  const restoreWindow = installFakeStorageWindow();
  let parseClick = null;
  let applyClick = null;
  let refreshCount = 0;
  const titleField = { value: "Хуки тест" };
  const textField = { value: "Первый хук\nВторой хук" };
  const parseButton = { addEventListener: (_event, callback) => { parseClick = callback; } };
  const applyButton = { addEventListener: (_event, callback) => { applyClick = callback; } };
  const root = createHooksRoot({
    "#hook-version-title": titleField,
    "#hook-text-input": textField,
    "#parse-hook-text": parseButton,
    "#apply-hook-draft": applyButton
  });

  try {
    bindHooksEvents(root, () => { refreshCount += 1; });
    parseClick();

    assert.equal(refreshCount, 1);
    const html = renderHooksPanel();
    assert.match(html, /2 хуков готовы/);

    applyClick();
    assert.equal(refreshCount, 2);
    assert.match(renderHooksPanel(), /Используются сейчас/);
  } finally {
    restoreWindow();
  }
});

function createHooksRoot(map) {
  return {
    querySelector(selector) {
      return map[selector] || null;
    }
  };
}

function installFakeStorageWindow() {
  const originalWindow = globalThis.window;
  const storage = new Map();
  globalThis.window = {
    localStorage: {
      getItem(key) {
        return storage.has(key) ? storage.get(key) : null;
      },
      setItem(key, value) {
        storage.set(key, String(value));
      },
      removeItem(key) {
        storage.delete(key);
      }
    }
  };
  return () => {
    globalThis.window = originalWindow;
  };
}
