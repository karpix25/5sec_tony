import test from "node:test";
import assert from "node:assert/strict";
import { renderProductSelectOptions } from "../src/ui/product-select.js";

test("product select renders only products passed by active project", () => {
  const html = renderProductSelectOptions([
    { id: "protein", projectId: "project-a", name: "Протеин" },
    { id: "bar", projectId: "project-a", name: "Батончик" }
  ], "bar");

  assert.match(html, /value="protein"/);
  assert.match(html, /value="bar" selected/);
  assert.doesNotMatch(html, /optgroup/);
});
