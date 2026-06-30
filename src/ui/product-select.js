import { escapeHtml } from "./infographic.js";

export function renderProductSelectOptions(products = [], selectedProductId = "") {
  return products.map((product) => renderProductOption(product, selectedProductId)).join("")
    || "<option value=\"\" disabled>Нет продуктов</option>";
}

function renderProductOption(product, selectedProductId) {
  const selected = product.id === selectedProductId ? " selected" : "";
  return `<option value="${escapeHtml(product.id)}"${selected}>${escapeHtml(product.name)}</option>`;
}
