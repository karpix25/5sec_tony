import test from "node:test";
import assert from "node:assert/strict";
import { bindYandexFolderPickers } from "../src/ui/yandex-folder-picker.js";
import { FakeElement, createFakeDocument } from "./helpers/fake-ui-dom.mjs";

test("yandex picker shares in-flight cache, keeps selected custom path, and updates status on change", async () => {
  const originalFetch = globalThis.fetch;
  const originalDocument = globalThis.document;
  const requests = [];

  globalThis.document = createFakeDocument();
  globalThis.fetch = async (url) => {
    requests.push(String(url));
    return {
      ok: true,
      json: async () => ({
        folders: [
          { path: "disk:/ВИДЕО", label: "disk:/ВИДЕО" },
          { path: "disk:/ВИДЕО/Клиент", label: "Клиент" }
        ],
        truncated: false
      })
    };
  };

  try {
    const first = createPickerRoot("disk:/ВИДЕО/Клиент/Особый проект");
    const second = createPickerRoot("disk:/ВИДЕО");

    bindYandexFolderPickers(first.root);
    bindYandexFolderPickers(second.root);
    await flushAsyncWork();

    assert.equal(requests.length, 1);
    const firstSelect = first.tree.querySelector("[data-yandex-folder-tree-select]");
    const secondSelect = second.tree.querySelector("[data-yandex-folder-tree-select]");
    assert.ok(firstSelect);
    assert.ok(secondSelect);
    assert.equal(first.valueInput.value, "disk:/ВИДЕО/Клиент/Особый проект");
    assert.equal(firstSelect.value, "disk:/ВИДЕО/Клиент/Особый проект");
    assert.equal(firstSelect.children.at(-1).value, "disk:/ВИДЕО/Клиент/Особый проект");
    assert.match(first.status.textContent, /Папок в списке: 3/);

    secondSelect.value = "disk:/ВИДЕО/Клиент";
    secondSelect.dispatchEvent({ type: "change", target: secondSelect });
    assert.equal(second.valueInput.value, "disk:/ВИДЕО/Клиент");
    assert.equal(second.status.textContent, "Выбрано: disk:/ВИДЕО/Клиент");
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.document = originalDocument;
  }
});

function createPickerRoot(initialValue) {
  const status = new FakeElement({ dataset: { yandexFolderStatus: "" } });
  const field = new FakeElement({ className: "stacked-field" });
  const root = new FakeElement();
  const picker = new FakeElement({ dataset: { yandexFolderPicker: "", yandexRoot: "disk:/ВИДЕО" } });
  const valueInput = new FakeElement({ dataset: { yandexFolderValue: "" }, value: initialValue, tagName: "input" });
  const tree = new FakeElement({ dataset: { yandexFolderLevels: "" } });

  root.append(field);
  field.append(picker, status);
  picker.append(valueInput, tree);

  return { root, picker, tree, valueInput, status };
}

async function flushAsyncWork() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}
