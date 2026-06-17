import test from "node:test";
import assert from "node:assert/strict";
import { productReferencesFromImages } from "../src/ui/product-ai.js";

test("product photo references keep ai label and packaging lock details", () => {
  const references = productReferencesFromImages([
    { name: "chlorophyll-front.png", dataUrl: "data:image/png;base64,AAA" }
  ], "Сохранить белую бутылку, зеленую этикетку, вертикальную надпись Chlorophyll, белую крышку и не менять компоновку текста.");

  assert.equal(references.length, 1);
  assert.equal(references[0].title, "chlorophyll-front.png");
  assert.match(references[0].promptComment, /белую бутылку/);
  assert.match(references[0].promptComment, /зеленую этикетку/);
  assert.match(references[0].promptComment, /не менять компоновку текста/);
});
