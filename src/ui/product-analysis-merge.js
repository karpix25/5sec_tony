export function getLiveProductDraft(root, store, productId, getFormSnapshot, fallback) {
  const state = store.getState();
  const current = state.products.find((item) => item.id === productId) || fallback;
  if (state.selectedProductId !== productId) return current;
  const form = root.querySelector("#product-settings-form");
  return { ...current, ...getFormSnapshot(form) };
}

export function mergeAnalyzedProductDraft(productPayloadFromDraft, initialProduct, liveProduct, draft, references) {
  const aiPayload = productPayloadFromDraft(liveProduct, draft, references);
  const manualOverrides = {};
  ["name", "description", "offer", "components", "pains", "facts", "forbidden"].forEach((fieldName) => {
    if (normalizeProductComparableValue(initialProduct[fieldName]) !== normalizeProductComparableValue(liveProduct[fieldName])) {
      manualOverrides[fieldName] = liveProduct[fieldName];
    }
  });
  return { ...aiPayload, ...manualOverrides, references: [...references, ...(liveProduct.references || [])] };
}

function normalizeProductComparableValue(value) {
  return Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).join("\n")
    : String(value || "").trim();
}
