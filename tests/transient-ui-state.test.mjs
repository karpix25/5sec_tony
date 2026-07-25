import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { captureTransientUiState, restoreTransientUiState } from "../src/ui/transient-ui-state.js";

test("transient generation controls survive full rerender restore", () => {
  const generationCount = { value: "7" };
  const hookTitle = { value: "Хуки июнь" };
  const hookText = { value: "Первый хук\nВторой хук" };
  const dailyLimit = { name: "dailyLimit", type: "number", value: "42" };
  const projectLimit = { name: "projectLimit", type: "number", value: "176" };
  const projectName = { name: "name", type: "text", value: "Новый проект" };
  const yandexDiskFolder = { name: "yandexDiskFolder", type: "hidden", value: "disk:/ВИДЕО/Клиент/Проект" };
  const projectForm = { id: "project-settings-form", elements: [projectName, yandexDiskFolder, dailyLimit, projectLimit] };
  const avatarVideoSection = { dataset: { avatarSection: "video" }, open: true };
  const root = createRoot({
    generationCount,
    hookTitle,
    hookText,
    forms: {
      "project-settings-form": projectForm
    },
    details: { video: avatarVideoSection }
  });

  const snapshot = captureTransientUiState(root);

  generationCount.value = "1";
  hookTitle.value = "";
  hookText.value = "";
  dailyLimit.value = "10";
  projectLimit.value = "20";
  projectName.value = "Старое имя";
  yandexDiskFolder.value = "disk:/ВИДЕО";
  avatarVideoSection.open = false;

  restoreTransientUiState(root, snapshot);

  assert.equal(generationCount.value, "7");
  assert.equal(hookTitle.value, "Хуки июнь");
  assert.equal(hookText.value, "Первый хук\nВторой хук");
  assert.equal(dailyLimit.value, "42");
  assert.equal(projectLimit.value, "176");
  assert.equal(projectName.value, "Новый проект");
  assert.equal(yandexDiskFolder.value, "disk:/ВИДЕО/Клиент/Проект");
  assert.equal(avatarVideoSection.open, true);
});

test("transient form restore skips drafts from another product context", () => {
  const oldName = { name: "name", type: "text", value: "Протеин" };
  const newName = { name: "name", type: "text", value: "Новый продукт тест" };
  const snapshot = captureTransientUiState(createRoot({
    forms: {
      "product-settings-form": {
        id: "product-settings-form",
        dataset: { transientContext: "product:old" },
        elements: [oldName]
      }
    }
  }));

  restoreTransientUiState(createRoot({
    forms: {
      "product-settings-form": {
        id: "product-settings-form",
        dataset: { transientContext: "product:new" },
        elements: [newName]
      }
    }
  }), snapshot);

  assert.equal(newName.value, "Новый продукт тест");
});

test("transient form restore skips project settings drafts from another project", () => {
  const oldName = { name: "name", type: "text", value: "Power Pro" };
  const newName = { name: "name", type: "text", value: "BBHERB" };
  const snapshot = captureTransientUiState(createRoot({
    forms: {
      "project-settings-form": {
        id: "project-settings-form",
        dataset: { transientContext: "project:old" },
        elements: [oldName]
      }
    }
  }));

  restoreTransientUiState(createRoot({
    forms: {
      "project-settings-form": {
        id: "project-settings-form",
        dataset: { transientContext: "project:new" },
        elements: [newName]
      }
    }
  }), snapshot);

  assert.equal(newName.value, "BBHERB");
});

test("transient form restore keeps project settings drafts for the same project", () => {
  const draftName = { name: "name", type: "text", value: "Черновик проекта" };
  const renderedName = { name: "name", type: "text", value: "Сохраненное имя" };
  const snapshot = captureTransientUiState(createRoot({
    forms: {
      "project-settings-form": {
        id: "project-settings-form",
        dataset: { transientContext: "project:same" },
        elements: [draftName]
      }
    }
  }));

  restoreTransientUiState(createRoot({
    forms: {
      "project-settings-form": {
        id: "project-settings-form",
        dataset: { transientContext: "project:same" },
        elements: [renderedName]
      }
    }
  }), snapshot);

  assert.equal(renderedName.value, "Черновик проекта");
});

test("transient form restore keeps drafts for the same product context", () => {
  const draftName = { name: "name", type: "text", value: "Черновик продукта" };
  const renderedName = { name: "name", type: "text", value: "Сохраненное имя" };
  const snapshot = captureTransientUiState(createRoot({
    forms: {
      "product-settings-form": {
        id: "product-settings-form",
        dataset: { transientContext: "product:same" },
        elements: [draftName]
      }
    }
  }));

  restoreTransientUiState(createRoot({
    forms: {
      "product-settings-form": {
        id: "product-settings-form",
        dataset: { transientContext: "product:same" },
        elements: [renderedName]
      }
    }
  }), snapshot);

  assert.equal(renderedName.value, "Черновик продукта");
});

test("transient form state ignores file inputs", () => {
  const fileInput = createFileInput("imageFile", "C:\\fakepath\\reference.png");
  const title = { name: "title", type: "text", value: "Новый стиль" };
  const snapshot = captureTransientUiState(createRoot({
    forms: {
      "reference-form": {
        id: "reference-form",
        elements: [title, fileInput]
      }
    }
  }));

  assert.deepEqual(snapshot.forms["reference-form"].draft, { title: "Новый стиль" });

  const renderedFileInput = createFileInput("imageFile", "");
  const renderedTitle = { name: "title", type: "text", value: "" };
  restoreTransientUiState(createRoot({
    forms: {
      "reference-form": {
        id: "reference-form",
        elements: [renderedTitle, renderedFileInput]
      }
    }
  }), {
    forms: {
      "reference-form": {
        context: "",
        draft: { title: "Новый стиль", imageFile: "C:\\fakepath\\reference.png" }
      }
    }
  });

  assert.equal(renderedTitle.value, "Новый стиль");
  assert.equal(renderedFileInput.value, "");
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

function createFileInput(name, initialValue) {
  let value = initialValue;
  return {
    name,
    type: "file",
    get value() {
      return value;
    },
    set value(next) {
      if (next !== "") throw new Error("File input value cannot be set");
      value = next;
    }
  };
}
