import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { captureTransientUiState, restoreTransientUiState } from "../src/ui/transient-ui-state.js";

test("transient generation controls survive full rerender restore", () => {
  const generationCount = { value: "7" };
  const enabled = { name: "enabled", type: "checkbox", checked: true };
  const targetCount = { name: "targetCount", type: "number", value: "42" };
  const form = { elements: [enabled, targetCount] };
  const root = createRoot({ generationCount, form });

  const snapshot = captureTransientUiState(root);

  generationCount.value = "1";
  enabled.checked = false;
  targetCount.value = "10";

  restoreTransientUiState(root, snapshot);

  assert.equal(generationCount.value, "7");
  assert.equal(enabled.checked, true);
  assert.equal(targetCount.value, "42");
});

test("state persistence guards against blurred dirty form controls", () => {
  const source = readFileSync(new URL("../src/state/state-persistence.js", import.meta.url), "utf8");

  assert.match(source, /hasDirtyFormControls/);
  assert.match(source, /defaultValue/);
  assert.match(source, /defaultChecked/);
  assert.match(source, /files\?\.length/);
});

function createRoot({ generationCount, form }) {
  return {
    querySelector(selector) {
      if (selector === "#generation-count") return generationCount;
      if (selector === "#automation-form") return form;
      return null;
    }
  };
}
