import test from "node:test";
import assert from "node:assert/strict";
import { renderProductSelectOptions } from "../src/ui/product-select.js";

test("product select renders products grouped by project", () => {
  const html = renderProductSelectOptions([
    { id: "project-a", name: "Power Pro" },
    { id: "project-b", name: "I.C.Lab" }
  ], [
    { id: "protein", projectId: "project-a", name: "Протеин" },
    { id: "serum", projectId: "project-b", name: "Сыворотка" }
  ], "serum");

  assert.match(html, /label="Power Pro"/);
  assert.match(html, /label="I\.C\.Lab"/);
  assert.match(html, /value="protein"/);
  assert.match(html, /value="serum" selected/);
});
