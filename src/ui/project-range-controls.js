import { normalizeProductInFramePercent } from "../domain/product-visual-policy.js";

export function bindProjectRangeControls(root) {
  root.querySelectorAll("[data-product-in-frame-input]").forEach((input) => {
    updateProductInFrameValue(input);
    input.addEventListener("input", () => updateProductInFrameValue(input));
    input.addEventListener("change", () => updateProductInFrameValue(input));
  });
}

export function updateProductInFrameValue(input) {
  const valueNode = input.closest("[data-product-in-frame-field]")?.querySelector("[data-product-in-frame-value]");
  if (!valueNode) return;
  valueNode.textContent = `${normalizeProductInFramePercent(input.value)}%`;
}
