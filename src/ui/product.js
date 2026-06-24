import { escapeHtml } from "./infographic.js";
import { productBriefFields } from "./brief-field-labels.js";
import { renderPreviewTrigger } from "./preview-modal.js";

export function renderProductSettings({ product }) {
  const ready = isProductReady(product);
  const productCount = Number(product?.projectProductCount || 1);
  const canDeleteProduct = productCount > 1;
  return `
    <section class="product-screen">
      <div class="product-action-bar">
        <div><span class="eyebrow">Текущий продукт</span><h2>${escapeHtml(product.name)}</h2></div>
        <div class="form-actions">
          <button id="open-product-modal" class="ghost-btn" type="button">+ Новый продукт</button>
          <button class="secondary-btn" form="product-settings-form" type="submit">Сохранить изменения</button>
        </div>
      </div>
      <div class="product-stage-grid">
        <form id="product-settings-form" class="ops-form text-editor-form product-editor">
          <section class="product-card">
            <div class="product-card-head">
              <div><span class="eyebrow">Основа</span><h3>Название продукта</h3></div>
              <span class="product-status ${ready ? "ready" : ""}">${ready ? "готов к генерации" : "нужны фото"}</span>
            </div>
            ${productBriefField("name", "input", product.name, true)}
          </section>
          ${renderProductSummary(product, ready)}
          <div class="form-actions">
            <button class="danger-btn" id="open-delete-product-modal" type="button" ${canDeleteProduct ? "" : "disabled title=\"Нельзя удалить единственный продукт в проекте\""}>Удалить продукт</button>
          </div>
          ${canDeleteProduct ? "" : `<small class="locked-note">В проекте должен оставаться минимум один продукт.</small>`}
        </form>
        ${renderProductFieldsModal(product, ready)}
        <aside class="product-side">
          ${renderPhotoAnalysis()}
        </aside>
      </div>
      ${renderProductReferences(product)}
      ${renderCreateProductModal()}
      ${renderDeleteProductModal(product, canDeleteProduct)}
    </section>
  `;
}

function renderDeleteProductModal(product, canDeleteProduct) {
  return `
    <div id="delete-product-modal" class="modal-shell" hidden>
      <div class="modal-backdrop" data-close-delete-product-modal></div>
      <section class="panel project-modal danger-modal">
        <div class="panel-head compact">
          <div><span class="eyebrow">Удаление</span><h2>Удалить продукт</h2></div>
          <button class="danger-icon" data-close-delete-product-modal type="button" aria-label="Закрыть">×</button>
        </div>
        <div class="danger-zone">
          <strong>${escapeHtml(product.name)}</strong>
          <small>Будут удалены карточка продукта, его фото-референсы и задачи генерации, связанные с этим продуктом.</small>
          ${canDeleteProduct
            ? `<button class="danger-btn" data-delete-product="${product.id}" type="button">Удалить продукт навсегда</button>`
            : `<small class="locked-note">Нельзя удалить последний продукт в проекте.</small>`}
        </div>
      </section>
    </div>
  `;
}

export function openDeleteProductModal(root) {
  root.querySelector("#delete-product-modal")?.removeAttribute("hidden");
}

export function closeDeleteProductModal(root) {
  root.querySelector("#delete-product-modal")?.setAttribute("hidden", "");
}

function renderProductSummary(product, ready) {
  return `
    <section class="product-card">
      <div class="product-card-head">
        <div><span class="eyebrow">Смыслы</span><h3>Краткая выжимка</h3></div>
        <button id="open-product-fields-modal" class="secondary-btn" type="button" ${ready ? "" : "disabled"}>Открыть поля</button>
      </div>
      ${ready ? `
        <div class="product-summary-grid">
          ${summaryItem(productBriefFields.description.label, product.description || "не заполнено")}
          ${summaryItem("Зачем покупают", listValue(product.pains) || "не заполнено")}
          ${summaryItem(productBriefFields.offer.label, product.offer || "не заполнено")}
          ${summaryItem(productBriefFields.components.label, product.components || "не заполнено")}
          ${summaryItem(productBriefFields.facts.label, listValue(product.facts) || "не заполнено")}
        </div>
      ` : `<div class="locked-note">Универсальная анкета появится после загрузки фото и анализа продукта.</div>`}
    </section>
  `;
}

function renderProductFieldsModal(product, ready) {
  return `
    <div id="product-fields-modal" class="modal-shell" hidden>
      <div class="modal-backdrop" data-close-product-fields-modal></div>
      <section class="panel project-modal product-fields-modal">
        <div class="panel-head compact">
          <div><span class="eyebrow">Универсальная анкета</span><h2>${escapeHtml(product.name)}</h2></div>
          <button class="danger-icon" data-close-product-fields-modal type="button" aria-label="Закрыть">×</button>
        </div>
        ${ready ? `
          ${productBriefField("description", "textarea", product.description, false, "product-settings-form")}
          ${productBriefField("pains", "textarea", listValue(product.pains), false, "product-settings-form")}
          ${productBriefField("offer", "textarea", product.offer, false, "product-settings-form")}
          ${productBriefField("facts", "textarea", listValue(product.facts), false, "product-settings-form")}
          ${productBriefField("components", "textarea", product.components, false, "product-settings-form")}
          ${productBriefField("forbidden", "textarea", listValue(product.forbidden), false, "product-settings-form")}
          <button class="secondary-btn" form="product-settings-form" type="submit">Сохранить анкету</button>
        ` : `<div class="locked-note">Сначала загрузите фото продукта и запустите анализ.</div>`}
      </section>
    </div>
  `;
}

function renderPhotoAnalysis() {
  return `
    <section class="product-step product-photo-panel">
      <div class="product-step-head"><b>2</b><div><h3>Фото и анализ</h3><p>Загрузите упаковку со всех сторон и этикетку крупно.</p></div></div>
      <form id="product-photo-analysis-form" class="photo-analysis-form">
        <input name="photos" class="file-input" type="file" accept="image/*" multiple />
        <button class="secondary-btn" type="submit">Проанализировать фото</button>
        <small id="product-ai-status">После анализа карточка продукта заполнится автоматически.</small>
      </form>
      <div class="photo-hints">
        <span>лицевая сторона</span><span>оборот</span><span>состав</span><span>предупреждения</span>
      </div>
    </section>
  `;
}

function renderCreateProductModal() {
  return `
    <div id="product-modal" class="modal-shell" hidden>
      <div class="modal-backdrop" data-close-product-modal></div>
      <section class="panel project-modal">
        <div class="panel-head compact">
          <div><span class="eyebrow">Новый продукт</span><h2>Название и фото</h2></div>
          <button class="danger-icon" data-close-product-modal type="button" aria-label="Закрыть">×</button>
        </div>
        <form id="product-form" class="ops-form text-editor-form product-create-form">
          ${productBriefField("name", "input", "", true)}
          <label class="stacked-field">
            <span>Фото упаковки и этикетки</span>
            <input name="photos" class="file-input" type="file" accept="image/*" multiple required />
          </label>
          <small class="modal-help">Фото станут референсами продукта. Система прочитает упаковку или материалы и заполнит карточку продукта.</small>
          <button class="secondary-btn" type="submit">Создать и проанализировать</button>
          <small id="new-product-ai-status"></small>
        </form>
      </section>
    </div>
  `;
}

export async function getProductReferencePayload(form) {
  const file = form.querySelector("input[type='file']")?.files?.[0];
  const payload = Object.fromEntries(new FormData(form).entries());
  form.reset();
  if (!file) return payload;
  payload.imageName = file.name;
  payload.imageData = await readProductReferenceFile(file);
  return payload;
}

function renderProductReferences(product) {
  return `
    <section class="product-reference-box">
      <div class="panel-head compact">
        <div><span class="eyebrow">Фото</span><h2>Референсы продукта</h2></div>
        <button id="open-product-reference-modal" class="secondary-btn" type="button">+ Добавить фото</button>
      </div>
      <div class="product-reference-list">
        ${(product.references || []).map(renderProductReference).join("") || "<p class='empty'>Пока нет референсов продукта.</p>"}
      </div>
      ${renderProductReferenceModal()}
    </section>
  `;
}

function renderProductReferenceModal() {
  return `
    <div id="product-reference-modal" class="modal-shell" hidden>
      <div class="modal-backdrop" data-close-product-reference-modal></div>
      <section class="panel project-modal">
        <div class="panel-head compact">
          <div><span class="eyebrow">Фото продукта</span><h2>Добавить референс</h2></div>
          <button class="danger-icon" data-close-product-reference-modal type="button" aria-label="Закрыть">×</button>
        </div>
        <form id="product-reference-form" class="ops-form text-editor-form product-reference-form">
          ${productField("Название референса", "title", "Например: упаковка крупно, продукт в руке", "input", "", true)}
          ${productFileField("Картинка продукта", "imageFile")}
          ${productField("Как использовать фото", "promptComment", "Что важно сохранить: форму упаковки, фактуру, ракурс, цвет, обязательные детали.", "textarea")}
          <button class="secondary-btn" type="submit">Добавить фото</button>
        </form>
      </section>
    </div>
  `;
}

function summaryItem(label, value) {
  return `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function productBriefField(name, type = "input", value = "", required = false, formId = "") {
  const field = productBriefFields[name];
  return productField(field.label, name, field.placeholder, type, value, required, formId);
}

function renderProductReference(reference) {
  return `
    <article class="product-reference-item">
      ${reference.imageData ? renderPreviewTrigger({
        src: reference.imageData,
        title: reference.title,
        className: "asset-preview-button"
      }) : `<span class="asset-thumb">P</span>`}
      <div>
        <strong>${escapeHtml(reference.title)}</strong>
        <small>${escapeHtml(reference.promptComment || reference.imageName || "референс продукта")}</small>
        <small>${formatProductReferenceDate(reference.createdAt)}</small>
      </div>
      <button class="danger-icon" data-delete-product-reference="${reference.id}" type="button" aria-label="Удалить референс продукта">×</button>
    </article>
  `;
}

function productField(label, name, placeholder, type = "input", value = "", required = false, formId = "") {
  const requiredAttr = required ? "required" : "";
  const formAttr = formId ? `form="${escapeHtml(formId)}"` : "";
  const escapedValue = escapeHtml(value || "");
  const control = type === "textarea"
    ? `<textarea name="${name}" class="textarea editor-textarea" placeholder="${escapeHtml(placeholder)}" ${requiredAttr} ${formAttr}>${escapedValue}</textarea>`
    : `<input name="${name}" class="text-input" value="${escapedValue}" placeholder="${escapeHtml(placeholder)}" ${requiredAttr} ${formAttr} />`;

  return `<label class="stacked-field"><span>${escapeHtml(label)}</span>${control}</label>`;
}

function isProductReady(product) {
  return Boolean((product.references || []).length || product.description || product.components);
}

function listValue(items = []) {
  return Array.isArray(items) ? items.join("\n") : items;
}

function formatProductReferenceDate(value) {
  if (!value) return "дата не указана";
  return new Date(value).toLocaleDateString("ru-RU");
}

function productFileField(label, name) {
  return `
    <label class="stacked-field">
      <span>${escapeHtml(label)}</span>
      <input name="${escapeHtml(name)}" class="file-input" type="file" accept="image/*" />
    </label>
  `;
}

function readProductReferenceFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
