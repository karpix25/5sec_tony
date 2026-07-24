import test from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../src/state/store.js";

test("selecting a product from another project switches project context", () => {
  const store = createStore();
  const firstProjectId = store.getState().selectedProjectId;
  const firstProductId = store.getState().selectedProductId;
  store.createProject({ name: "Второй проект", productName: "Другой продукт" });

  store.selectProduct(firstProductId);

  assert.equal(store.getState().selectedProjectId, firstProjectId);
  assert.equal(store.getState().selectedProductId, firstProductId);
});

test("selecting another product in the same project keeps selected design reference", async () => {
  const store = createStore();
  const firstProductId = store.getState().selectedProductId;
  store.createProduct({ name: "Другой продукт" });
  await store.createReference({ title: "Воронка", type: "design", imageData: "https://example.com/funnel.png" });
  const selectedReferenceId = store.getState().selectedReferenceId;

  store.selectProduct(firstProductId);

  assert.equal(store.getState().selectedProductId, firstProductId);
  assert.equal(store.getState().selectedReferenceId, selectedReferenceId);
});
