import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { projects } from "../src/domain/entities.js";
import { renderProductSettings } from "../src/ui/product.js";

test("product settings save reads form without resetting values", () => {
  const source = readFileSync(new URL("../src/ui/render.js", import.meta.url), "utf8");
  const handler = source.match(/#product-settings-form[\s\S]+?}\);/);

  assert.ok(handler, "product settings submit handler exists");
  assert.match(handler[0], /store\.updateProduct\(getFormSnapshot\(event\.currentTarget\)\)/);
  assert.doesNotMatch(handler[0], /getFormPayload\(event\.currentTarget\)/);
});

test("product questionnaire fields are explicitly attached to settings form", () => {
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

  assert.ok(html.indexOf("id=\"product-fields-modal\"") > html.indexOf("</form>"));
  assert.match(html, /name="description"[^>]+form="product-settings-form"/);
  assert.match(html, /name="pains"[^>]+form="product-settings-form"/);
  assert.match(html, /name="offer"[^>]+form="product-settings-form"/);
  assert.match(html, /name="facts"[^>]+form="product-settings-form"/);
  assert.match(html, /name="forbidden"[^>]+form="product-settings-form"/);
});
