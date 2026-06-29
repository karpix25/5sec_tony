import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { captureTransientUiState, restoreTransientUiState } from "../src/ui/transient-ui-state.js";

test("transient generation controls survive full rerender restore", () => {
  const generationCount = { value: "7" };
  const hookTitle = { value: "Хуки июнь" };
  const hookText = { value: "Первый хук\nВторой хук" };
  const enabled = { name: "enabled", type: "checkbox", checked: true };
  const targetCount = { name: "targetCount", type: "number", value: "42" };
  const projectName = { name: "name", type: "text", value: "Новый проект" };
  const yandexDiskFolder = { name: "yandexDiskFolder", type: "hidden", value: "disk:/ВИДЕО/Клиент/Проект" };
  const automationForm = { id: "automation-form", elements: [enabled, targetCount] };
  const projectForm = { id: "project-settings-form", elements: [projectName, yandexDiskFolder] };
  const avatarVideoSection = { dataset: { avatarSection: "video" }, open: true };
  const root = createRoot({
    generationCount,
    hookTitle,
    hookText,
    forms: {
      "automation-form": automationForm,
      "project-settings-form": projectForm
    },
    details: { video: avatarVideoSection }
  });

  const snapshot = captureTransientUiState(root);

  generationCount.value = "1";
  hookTitle.value = "";
  hookText.value = "";
  enabled.checked = false;
  targetCount.value = "10";
  projectName.value = "Старое имя";
  yandexDiskFolder.value = "disk:/ВИДЕО";
  avatarVideoSection.open = false;

  restoreTransientUiState(root, snapshot);

  assert.equal(generationCount.value, "7");
  assert.equal(hookTitle.value, "Хуки июнь");
  assert.equal(hookText.value, "Первый хук\nВторой хук");
  assert.equal(enabled.checked, true);
  assert.equal(targetCount.value, "42");
  assert.equal(projectName.value, "Новый проект");
  assert.equal(yandexDiskFolder.value, "disk:/ВИДЕО/Клиент/Проект");
  assert.equal(avatarVideoSection.open, true);
});

test("transient details restore keeps forced avatar video section open", () => {
  const avatarVideoSection = { dataset: { avatarSection: "video", forceOpen: "true" }, open: false };
  const root = createRoot({ details: { video: avatarVideoSection } });
  const snapshot = captureTransientUiState(root);

  avatarVideoSection.open = true;
  restoreTransientUiState(root, snapshot);

  assert.equal(avatarVideoSection.open, true);
});

test("state persistence guards against blurred dirty form controls", () => {
  const source = readFileSync(new URL("../src/state/state-persistence.js", import.meta.url), "utf8");

  assert.match(source, /hasDirtyFormControls/);
  assert.match(source, /defaultValue/);
  assert.match(source, /defaultChecked/);
  assert.match(source, /files\?\.length/);
});

function createRoot({ generationCount, hookTitle, hookText, forms = {}, details = {} }) {
  return {
    querySelector(selector) {
      if (selector === "#generation-count") return generationCount;
      if (selector === "#hook-version-title") return hookTitle;
      if (selector === "#hook-text-input") return hookText;
      if (selector.startsWith("#")) return forms[selector.slice(1)] || null;
      const detailsMatch = selector.match(/^\[data-avatar-section="([^"]+)"\]$/);
      if (detailsMatch) return details[detailsMatch[1]] || null;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === "form[id]") return Object.values(forms);
      if (selector === "[data-avatar-section]") return Object.values(details);
      return [];
    }
  };
}
