import { escapeHtml } from "./infographic.js";
import { getProductContentDirections, normalizeProductContentDirections } from "../domain/product-content-directions.js";

export function renderProductContentDirections(product = {}) {
  const directions = getProductContentDirections(product);
  if (!directions) {
    return `
      <section class="product-step content-directions-panel">
        <div class="product-step-head"><b>3</b><div><h3>Направления контента</h3><p>Сначала рассчитайте темы вокруг этого продукта.</p></div></div>
        <button class="secondary-btn" data-refresh-product-directions type="button">Рассчитать направления</button>
        <input type="hidden" name="contentDirections" data-content-directions-value value="" />
        ${renderCustomDirectionEditor()}
        <small id="product-directions-status">Направления появятся здесь и будут использоваться в генерациях.</small>
      </section>
    `;
  }

  return `
    <section class="product-step content-directions-panel">
      <div class="product-step-head"><b>3</b><div><h3>Направления контента</h3><p>Выберите, о чем модель может создавать посты.</p></div></div>
      <input type="hidden" name="contentDirections" data-content-directions-value value="${escapeHtml(JSON.stringify(directions))}" />
      <div class="content-direction-list">
        ${directions.items.map(renderDirection).join("")}
        ${directions.customItems.length ? `<div class="content-direction-group"><strong>Свои темы</strong>${directions.customItems.map(renderDirection).join("")}</div>` : ""}
      </div>
      ${renderCustomDirectionEditor(directions.customItems)}
      <button class="ghost-btn" data-refresh-product-directions type="button">Обновить направления</button>
      <small id="product-directions-status">Сам продукт используется примерно в каждом третьем посте, если направление включено.</small>
    </section>
  `;
}

export function syncProductContentDirections(root) {
  const form = root.querySelector("#product-settings-form");
  const hidden = form?.querySelector("[data-content-directions-value]");
  const customInput = form?.querySelector("[data-custom-content-directions]");
  if (!hidden || !form) return;
  const customItems = String(customInput?.value || "")
    .split("\n")
    .map((title) => title.trim())
    .filter(Boolean);
  const current = normalizeProductContentDirections(hidden.value)
    || (customItems.length ? normalizeProductContentDirections({ items: [{ id: "direct-product" }], customItems }) : null);
  if (!current) return;
  const toggles = [...form.querySelectorAll("[data-content-direction-toggle]")];
  const enabledIds = new Set(toggles.length
    ? toggles.filter((input) => input.checked).map((input) => input.dataset.contentDirectionToggle)
    : [...current.items, ...current.customItems].filter((item) => item.enabled !== false).map((item) => item.id));
  const nextCustomItems = normalizeProductContentDirections({ items: current.items, customItems })?.customItems || [];
  hidden.value = JSON.stringify({
    ...current,
    items: current.items.map((item) => ({ ...item, enabled: enabledIds.has(item.id) })),
    customItems: nextCustomItems.map((item) => ({
      ...item,
      enabled: current.customItems.some((currentItem) => currentItem.id === item.id)
        ? enabledIds.has(item.id)
        : true
    })) || []
  });
}

export function getSelectedContentDirectionIds(root) {
  return [...root.querySelectorAll("[data-content-direction-toggle]")]
    .filter((input) => input.checked)
    .map((input) => input.dataset.contentDirectionToggle)
    .filter(Boolean);
}

function renderDirection(direction) {
  const id = escapeHtml(direction.id);
  return `
    <label class="content-direction-item">
      <input type="checkbox" data-content-direction-toggle="${id}" ${direction.enabled ? "checked" : ""} />
      <span><strong>${escapeHtml(direction.title)}</strong><small>${escapeHtml(direction.relation || "Смежная тема вокруг продукта.")}</small></span>
    </label>
  `;
}

function renderCustomDirectionEditor(customItems = []) {
  return `
    <label class="content-direction-custom">
      <span><strong>Свои темы</strong><small>По одной теме в строке. Они появятся как отдельные чекбоксы и попадут в генерацию.</small></span>
      <textarea data-custom-content-directions rows="3" placeholder="Например: Как встроить продукт в утреннюю рутину">${escapeHtml(customItems.map((item) => item.title).join("\n"))}</textarea>
    </label>
  `;
}
