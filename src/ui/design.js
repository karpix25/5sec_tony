import { escapeHtml } from "./infographic.js";
import { getDesignReferences } from "../domain/references.js";
import { renderPreviewTrigger } from "./preview-modal.js";

export function renderDesignSettings({ project, reference }) {
  const references = getDesignReferences(project);
  return `
    <div class="design-workspace">
      <section class="reference-browser">
        <div class="panel-head compact">
          <div><span class="eyebrow">Референсы</span><h2>Библиотека стиля</h2></div>
        </div>
        <div class="reference-grid">
          ${references.map((item) => renderReferenceCard(item, reference?.id)).join("")}
        </div>
      </section>
      <form id="reference-form" class="ops-form text-editor-form reference-editor">
        <div class="panel-head compact">
          <div><span class="eyebrow">Новый референс</span><h2>Добавить дизайн-референс</h2></div>
        </div>
        ${designField("Название", "title", "Например: розовый glow, строгая сетка, карточки с иконками", "input", "", true)}
        ${designFileField("Картинка-референс", "imageFile")}
        ${designField("Шрифт / типографика стиля", "fontStyle", "Например: крупный белый bold sans с черной обводкой; вторичный тезис — контрастный serif. Будет фиксироваться во всех генерациях этого стиля.", "textarea")}
        ${designField("Доп. промт к копированию дизайна", "takeaways", "Например: усилить glow-заголовок, сохранить сетку карточек, оставить больше воздуха снизу, держать весь контент в safe zone.", "textarea")}
        <div class="form-actions">
          <button class="secondary-btn" type="submit">+ Добавить референс</button>
          <button class="ghost-btn" data-delete-reference="${reference?.id || ""}" type="button">Удалить выбранный</button>
        </div>
      </form>
    </div>
  `;
}

function renderReferenceCard(reference, selectedId) {
  return `
    <article class="reference-card ${reference.id === selectedId ? "active" : ""}">
      <button class="reference-select" data-select-reference="${reference.id}" type="button">
        ${reference.imageData ? `<img src="${escapeHtml(reference.imageData)}" alt="">` : `<span class="asset-thumb">D</span>`}
        <span>
          <strong>${escapeHtml(reference.title)}</strong>
          <small>${escapeHtml(reference.fontStyle || reference.takeaways || "референс дизайна")}</small>
          <small>${formatDesignReferenceDate(reference.createdAt)}</small>
        </span>
      </button>
      ${reference.imageData ? renderPreviewTrigger({
        src: reference.imageData,
        title: reference.title,
        className: "ghost-btn asset-open-btn",
        label: "Открыть референс крупно",
        content: "Открыть"
      }) : ""}
      <dl>
        <div><dt>Формат</dt><dd>9:16</dd></div>
        <div><dt>Шрифт</dt><dd>${escapeHtml(reference.fontStyle || reference.headlineStyle || "по референсу")}</dd></div>
        <div><dt>Safe zone</dt><dd>контент внутри кадра</dd></div>
      </dl>
    </article>
  `;
}

function designField(label, name, placeholder, type = "input", value = "", required = false) {
  const requiredAttr = required ? "required" : "";
  const control = type === "textarea"
    ? `<textarea name="${name}" class="textarea editor-textarea" placeholder="${escapeHtml(placeholder)}" ${requiredAttr}>${escapeHtml(value)}</textarea>`
    : `<input name="${name}" class="text-input" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" ${requiredAttr} />`;
  return `<label class="stacked-field"><span>${escapeHtml(label)}</span>${control}</label>`;
}

function designFileField(label, name) {
  return `
    <label class="stacked-field">
      <span>${escapeHtml(label)}</span>
      <input name="${escapeHtml(name)}" class="file-input" type="file" accept="image/*" />
    </label>
  `;
}

function formatDesignReferenceDate(value) {
  if (!value) return "дата не указана";
  return new Date(value).toLocaleDateString("ru-RU");
}
