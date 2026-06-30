import { escapeHtml } from "./infographic.js";

export function renderProductSelectOptions(projects = [], products = [], selectedProductId = "") {
  const projectOptions = projects
    .map((project) => renderProjectProductGroup(project, products, selectedProductId))
    .filter(Boolean);

  return projectOptions.join("") || "<option value=\"\" disabled>Нет продуктов</option>";
}

function renderProjectProductGroup(project, products, selectedProductId) {
  const projectProducts = products.filter((product) => product.projectId === project.id);
  if (!projectProducts.length) return "";

  return `
        <optgroup label="${escapeHtml(project.name)}">
          ${projectProducts.map((product) => renderProductOption(product, selectedProductId)).join("")}
        </optgroup>`;
}

function renderProductOption(product, selectedProductId) {
  const selected = product.id === selectedProductId ? " selected" : "";
  return `<option value="${escapeHtml(product.id)}"${selected}>${escapeHtml(product.name)}</option>`;
}
