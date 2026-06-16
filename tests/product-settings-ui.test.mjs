import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("product settings save reads form without resetting values", () => {
  const source = readFileSync(new URL("../src/ui/render.js", import.meta.url), "utf8");
  const handler = source.match(/#product-settings-form[\s\S]+?}\);/);

  assert.ok(handler, "product settings submit handler exists");
  assert.match(handler[0], /store\.updateProduct\(getFormSnapshot\(event\.currentTarget\)\)/);
  assert.doesNotMatch(handler[0], /getFormPayload\(event\.currentTarget\)/);
});
