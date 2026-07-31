import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderGlobalSaveControl, renderPersistenceStatus } from "../src/ui/persistence-status.js";

const renderSource = readFileSync(new URL("../src/ui/render.js", import.meta.url), "utf8");
const projectSource = readFileSync(new URL("../src/ui/project.js", import.meta.url), "utf8");
const productSource = readFileSync(new URL("../src/ui/product.js", import.meta.url), "utf8");
const persistenceSource = readFileSync(new URL("../src/ui/persistence-status.js", import.meta.url), "utf8");
const styleSource = readFileSync(new URL("../src/styles/project.css", import.meta.url), "utf8");

test("app exposes one shared save control instead of form-local save buttons", () => {
  assert.equal((persistenceSource.match(/id="save-all-changes"/g) || []).length, 1);
  assert.match(renderSource, /renderGlobalSaveControl/);
  assert.doesNotMatch(projectSource, /id="save-project-settings"/);
  assert.doesNotMatch(productSource, /form="product-settings-form"[^>]*>Сохранить/);
});

test("shared save control ignores a second click while the first save is running", () => {
  assert.match(persistenceSource, /save-all-changes[\s\S]{0,2400}(?:isSaving|phase === "saving")/);
  assert.match(persistenceSource, /save-all-changes[\s\S]{0,2400}return/);
});

test("persistence status renders operator-facing dirty, saving, saved and error states", () => {
  const cases = [
    ["dirty", "Есть изменения"],
    ["saving", "Сохраняем"],
    ["saved", "Сохранено в БД"],
    ["error", "Ошибка сохранения"]
  ];

  for (const [status, label] of cases) {
    const html = renderPersistenceStatus({ status });
    assert.match(html, new RegExp(`persistence-status ${status}`));
    assert.match(html, new RegExp(label));
  }

  assert.match(persistenceSource, /data-persistence-status/);
});

test("shared save control stays visible while the page is scrolled", () => {
  const controlCss = styleSource.match(/\.save-all-control,\s*\.global-save\s*\{[\s\S]*?\}/)?.[0] || "";
  assert.match(controlCss, /position:\s*fixed/);
  assert.match(controlCss, /bottom:/);
});

test("shared save control renders a disabled button until a draft exists", () => {
  const html = renderGlobalSaveControl();
  assert.match(html, /data-global-save-button[^>]*disabled/);
  assert.match(html, /data-global-save-status/);
});
