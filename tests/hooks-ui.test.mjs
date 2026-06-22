import test from "node:test";
import assert from "node:assert/strict";
import { renderHooksPanel, bindHooksEvents } from "../src/ui/hooks.js";

test("hooks panel shows empty helper when no active hooks or draft", () => {
  const html = renderHooksPanel();

  assert.match(html, /Добавить список хуков/);
  assert.match(html, /генератор начал использовать ваши референсы хуков/i);
});

test("parse hook text event builds a draft and enables apply action after refresh", () => {
  let parseClick = null;
  let applyClick = null;
  let refreshCount = 0;
  let library = { activeVersionId: "", versions: [] };
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

  bindHooksEvents(root, {
    getLibrary: () => library,
    saveLibrary: (nextLibrary) => { library = nextLibrary; },
    refresh: () => { refreshCount += 1; }
  });
  parseClick();

  assert.equal(refreshCount, 1);
  const html = renderHooksPanel(library);
  assert.match(html, /2 хуков готовы/);

  applyClick();
  assert.equal(refreshCount, 2);
  assert.match(renderHooksPanel(library), /Используются сейчас/);
});

function createHooksRoot(map) {
  return {
    querySelector(selector) {
      return map[selector] || null;
    }
  };
}
