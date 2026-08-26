import { escapeHtml } from "./infographic.js";
import { getProductContentDirections, normalizeProductContentDirections } from "../domain/product-content-directions.js";

export function renderProductContentDirections(product = {}) {
  const directions = getProductContentDirections(product);
  if (!directions) {
    return `
      <section class="product-step content-directions-panel">
        <div class="product-step-head"><b>3</b><div><h3>Направления контента</h3><p>Сначала рассчитайте темы вокруг этого продукта.</p></div></div>
        <button class="secondary-btn" data-refresh-product-directions type="button">Рассчитать направления</button>
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
      </div>
      <button class="ghost-btn" data-refresh-product-directions type="button">Обновить направления</button>
      <small id="product-directions-status">Сам продукт используется примерно в каждом третьем посте, если направление включено.</small>
    </section>
  `;
}

export function syncProductContentDirections(root) {
  const form = root.querySelector("#product-settings-form");
  const hidden = form?.querySelector("[data-content-directions-value]");
  if (!hidden) return;
  const current = normalizeProductContentDirections(hidden.value);
  if (!current) return;
  const enabledIds = new Set([...form.querySelectorAll("[data-content-direction-toggle]")]
    .filter((input) => input.checked)
    .map((input) => input.dataset.contentDirectionToggle));
  hidden.value = JSON.stringify({
    ...current,
    items: current.items.map((item) => ({ ...item, enabled: enabledIds.has(item.id) }))
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
