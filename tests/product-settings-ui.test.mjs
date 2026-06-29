import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { projects } from "../src/domain/entities.js";
import { renderProductSettings } from "../src/ui/product.js";

test("product settings save reads form without resetting values", () => {
  const renderSource = readFileSync(new URL("../src/ui/render.js", import.meta.url), "utf8");
  const source = readFileSync(new URL("../src/ui/product-events.js", import.meta.url), "utf8");
  const handler = source.match(/#product-settings-form[\s\S]+?}\);/);

  assert.match(renderSource, /bindProductEvents\(root, store\)/);
  assert.ok(handler, "product settings submit handler exists");
  assert.match(source, /store\.updateProductRemote/);
  assert.match(handler[0], /runProductSettingsSave\(root, store, event\.currentTarget\)/);
  assert.doesNotMatch(handler[0], /getFormPayload\(event\.currentTarget\)/);
});

test("product questionnaire fields are open inside settings form by default", () => {
  const product = projects[0].products?.[0] || {
    name: "Хлорофил",
    description: "Описание",
    offer: "Роль",
    pains: ["Боль"],
    facts: ["Факт"],
    forbidden: ["Запрет"],
    references: [{ title: "Фото", imageData: "data:image/png;base64,a" }]
  };
  const html = renderProductSettings({ product });
  const formEnd = html.indexOf("</form>");

  assert.doesNotMatch(html, /id="product-fields-modal"/);
  assert.doesNotMatch(html, /id="open-product-fields-modal"/);
  assert.doesNotMatch(html, /Сначала загрузите фото продукта/);
  assert.ok(html.indexOf('name="description"') > 0 && html.indexOf('name="description"') < formEnd);
  assert.ok(html.indexOf('name="pains"') > 0 && html.indexOf('name="pains"') < formEnd);
  assert.ok(html.indexOf('name="offer"') > 0 && html.indexOf('name="offer"') < formEnd);
  assert.ok(html.indexOf('name="facts"') > 0 && html.indexOf('name="facts"') < formEnd);
  assert.ok(html.indexOf('name="components"') > 0 && html.indexOf('name="components"') < formEnd);
  assert.ok(html.indexOf('name="forbidden"') > 0 && html.indexOf('name="forbidden"') < formEnd);
});

test("product settings disables delete for the last product in project", () => {
  const product = {
    name: "Хлорофил",
    description: "Описание",
    offer: "Роль",
    pains: ["Боль"],
    facts: ["Факт"],
    forbidden: ["Запрет"],
    references: [{ title: "Фото", imageData: "data:image/png;base64,a" }],
    projectProductCount: 1
  };
  const html = renderProductSettings({ product });

  assert.match(html, /id="open-delete-product-modal"[^>]+disabled/);
  assert.match(html, /минимум один продукт/i);
  assert.doesNotMatch(html, /data-delete-product=/);
});

test("product screen has a single save changes action", () => {
  const product = {
    name: "Хлорофил",
    description: "Описание",
    offer: "Роль",
    pains: ["Боль"],
    facts: ["Факт"],
    forbidden: ["Запрет"],
    references: [{ title: "Фото", imageData: "data:image/png;base64,a" }],
    projectProductCount: 2
  };
  const html = renderProductSettings({ product });
  const matches = html.match(/Сохранить изменения/g) || [];

  assert.equal(matches.length, 1);
  assert.doesNotMatch(html, /Сохранить анкету/);
  assert.doesNotMatch(html, /id="open-product-modal"/);
});

test("sidebar new product button opens modal instead of selecting product tab only", () => {
  const renderSource = readFileSync(new URL("../src/ui/render.js", import.meta.url), "utf8");
  const eventsSource = readFileSync(new URL("../src/ui/product-events.js", import.meta.url), "utf8");
  const button = renderSource.match(/<button id="open-product-modal"[^>]*>/)?.[0] || "";

  assert.match(button, /sidebar-action/);
  assert.doesNotMatch(button, /data-project-tab/);
  assert.match(eventsSource, /openProductModalWhenReady\(root, store\)/);
  assert.match(eventsSource, /store\.selectProjectTab\?\.\("product"\)/);
});
