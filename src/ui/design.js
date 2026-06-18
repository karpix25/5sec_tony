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
        ${renderDesignReferenceCandidate(project.designReferenceCandidates?.[0])}
        <div class="reference-grid">
          ${references.map((item) => renderReferenceCard(item, reference?.id)).join("")}
        </div>
      </section>
      <div class="reference-editor">
        ${renderReferenceForm(reference)}
      </div>
    </div>
  `;
}

function renderDesignReferenceCandidate(candidate) {
  if (!candidate) return "";
  return `
    <article class="avatar-review">
      ${candidate.imageData ? renderPreviewTrigger({
        src: candidate.imageData,
        title: candidate.title,
        className: "avatar-preview-trigger",
        label: "Открыть дизайн-шаблон"
      }) : `<div class="avatar-pending">...</div>`}
      <div>
        <span>${escapeHtml(getDesignCandidateStatus(candidate))}</span>
        <strong>${escapeHtml(candidate.title)}</strong>
        <small>${escapeHtml(candidate.failMsg || candidate.takeaways || "дизайн-шаблон")}</small>
      </div>
      <div class="avatar-review-actions">
        ${candidate.status === "review" ? `<button class="secondary-btn" data-approve-design-reference="${candidate.id}" type="button">Одобрить</button>` : ""}
        ${isDesignCandidateLoading(candidate) ? "<div class=\"avatar-loader\" aria-label=\"Ожидание результата\"><span></span><span></span><span></span></div>" : ""}
        ${!isDesignCandidateLoading(candidate) ? `<button class="ghost-btn" data-reject-design-reference="${candidate.id}" type="button">${candidate.status === "failed" ? "Убрать ошибку" : "Отклонить"}</button>` : ""}
      </div>
    </article>
  `;
}

function renderReferenceForm(reference) {
  return `
    <form id="reference-form" class="ops-form text-editor-form">
      <div class="panel-head compact">
        <div><span class="eyebrow">Дизайн-референс</span><h2>Создать или добавить стиль</h2></div>
      </div>
      ${designField("Название", "title", "Например: розовый glow, строгая сетка, карточки с иконками", "input", "", true)}
      ${designFileField("Файл референса", "imageFile")}
      ${designField("Промт", "prompt", "Опишите стиль с нуля или добавьте комментарии к загруженному файлу: фон, сетка, типографика, плашки, плотность, что важно повторять.", "textarea", "", true)}
      <div class="form-actions">
        <button class="secondary-btn" type="submit">Сохранить стиль</button>
        <button class="ghost-btn" data-delete-reference="${reference?.id || ""}" type="button">Удалить выбранный</button>
      </div>
    </form>
  `;
}

function getDesignCandidateStatus(candidate) {
  const labels = {
    submitting: "Запускаем создание",
    waiting: "Задача создана",
    generating: "Генерируем шаблон",
    review: "Шаблон готов",
    failed: "Ошибка создания"
  };
  return labels[candidate.status] || "В работе";
}

function isDesignCandidateLoading(candidate) {
  return ["submitting", "waiting", "generating"].includes(candidate.status);
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
      <button class="ghost-btn" data-delete-reference="${escapeHtml(reference.id)}" type="button">Удалить</button>
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
