import { escapeHtml } from "./infographic.js";
import { getDesignReferences } from "../domain/references.js";
import { renderPreviewTrigger } from "./preview-modal.js";
import { renderDesignReferenceAnalysis } from "./design-reference-analysis.js";
import { getOperationForTarget, getOperationsForScope } from "../state/operation-status.js";
import { getOperationLabel, isUiOperationBusy, renderOperationStatus } from "./operation-status-view.js";
import { hasUsefulDesignAnalysis } from "../domain/ai-artifacts.js";

export function renderDesignSettings({ project, reference, operations = {} }) {
  const references = getDesignReferences(project);
  const scope = getDesignReferenceScope(project.id);
  const uploadScope = getDesignReferenceUploadScope(project.id);
  const scopeOperations = [
    ...getOperationsForScope(operations, scope),
    ...getOperationsForScope(operations, uploadScope)
  ];
  const busyOperation = scopeOperations.find(isUiOperationBusy);
  const isBusy = Boolean(busyOperation);
  return `
    <div class="design-workspace">
      <section class="reference-browser">
        <div class="panel-head compact">
          <div><span class="eyebrow">Референсы</span><h2>Библиотека стиля</h2></div>
        </div>
        ${busyOperation ? renderOperationStatus(busyOperation) : ""}
        ${renderDesignReferenceCandidate(project.designReferenceCandidates?.[0], operations, scope, isBusy)}
        <div class="reference-grid">
          ${references.map((item) => renderReferenceCard(item, reference?.id, operations, scope, isBusy)).join("")}
        </div>
      </section>
      <div class="reference-editor">
        ${renderSelectedReferenceAnalysis(reference)}
        ${renderReferenceForm(reference, busyOperation)}
      </div>
    </div>
  `;
}

function renderSelectedReferenceAnalysis(reference) {
  if (!reference) return "";
  const hasAnalysis = hasUsefulDesignAnalysis(reference.designAnalysis);
  return `
    <section class="panel reference-analysis-panel">
      <div class="panel-head compact">
        <div><span class="eyebrow">AI-анализ</span><h2>Память дизайн-референса</h2></div>
        <button class="secondary-btn" data-refresh-design-analysis type="button">Обновить анализ</button>
      </div>
      ${renderDesignReferenceAnalysis(reference)}
      <small id="design-analysis-status">${hasAnalysis ? "Анализ сохранен и будет использован в генерациях." : "Анализ появится здесь после обновления."}</small>
    </section>
  `;
}

function renderDesignReferenceCandidate(candidate, operations, scope, isScopeBusy) {
  if (!candidate) return "";
  const operation = getOperationForTarget(operations, { scope, targetId: candidate.id });
  const isBusy = isScopeBusy || isUiOperationBusy(operation) || isDesignCandidateLoading(candidate);
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
        ${candidate.status === "review" ? `<button class="secondary-btn" data-approve-design-reference="${candidate.id}" type="button" ${isBusy ? "disabled" : ""}>Одобрить</button>` : ""}
        ${isDesignCandidateLoading(candidate) ? "<div class=\"avatar-loader\" aria-label=\"Ожидание результата\"><span></span><span></span><span></span></div>" : ""}
        ${!isDesignCandidateLoading(candidate) ? `<button class="ghost-btn" data-reject-design-reference="${candidate.id}" type="button" ${isBusy ? "disabled" : ""}>${candidate.status === "failed" ? "Убрать ошибку" : "Отклонить"}</button>` : ""}
      </div>
    </article>
  `;
}

function renderReferenceForm(reference, busyOperation) {
  const isBusy = isUiOperationBusy(busyOperation);
  const disabled = isBusy ? "disabled" : "";
  return `
    <form id="reference-form" class="ops-form text-editor-form">
      <div class="panel-head compact">
        <div><span class="eyebrow">Дизайн-референс</span><h2>Создать или добавить стиль</h2></div>
      </div>
      ${designField("Название", "title", "Например: розовый glow, строгая сетка, карточки с иконками", "input", "", true)}
      ${designFileField("Файл референса", "imageFile")}
      <div class="form-actions">
        <button class="secondary-btn" type="submit" ${disabled}>Сохранить стиль</button>
        ${reference?.id ? `<button class="secondary-btn" data-replace-reference="${escapeHtml(reference.id)}" type="submit" ${disabled}>Заменить выбранный</button>` : ""}
        <button class="ghost-btn" data-delete-reference="${reference?.id || ""}" type="button" ${disabled}>Удалить выбранный</button>
      </div>
      <small id="reference-form-status">${escapeHtml(getOperationLabel(busyOperation) || "Можно добавлять или заменять референсы.")}</small>
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

function renderReferenceCard(reference, selectedId, operations, scope, isScopeBusy) {
  const operation = getOperationForTarget(operations, { scope, targetId: reference.id });
  const isBusy = isScopeBusy || isUiOperationBusy(operation);
  const hasAnalysis = hasUsefulDesignAnalysis(reference.designAnalysis);
  return `
    <article class="reference-card ${reference.id === selectedId ? "active" : ""} ${isUiOperationBusy(operation) ? "busy" : ""}">
      <button class="reference-select" data-select-reference="${reference.id}" type="button" ${isBusy ? "disabled" : ""}>
        ${reference.imageData ? `<img src="${escapeHtml(reference.imageData)}" alt="">` : `<span class="asset-thumb">D</span>`}
        <span>
          <strong>${escapeHtml(reference.title)}</strong>
          <small>${escapeHtml(reference.fontStyle || reference.takeaways || "референс дизайна")}</small>
          <small>${escapeHtml(getOperationLabel(operation) || (hasAnalysis ? "AI-анализ сохранен" : "AI-анализ не рассчитан"))}</small>
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
      <button class="ghost-btn" data-delete-reference="${escapeHtml(reference.id)}" type="button" ${isBusy ? "disabled" : ""}>Удалить</button>
      <dl>
        <div><dt>Формат</dt><dd>9:16</dd></div>
        <div><dt>Шрифт</dt><dd>${escapeHtml(reference.fontStyle || reference.headlineStyle || "по референсу")}</dd></div>
        <div><dt>Safe zone</dt><dd>контент внутри кадра</dd></div>
      </dl>
    </article>
  `;
}

function getDesignReferenceScope(projectId) {
  return `design-references:${projectId}`;
}

function getDesignReferenceUploadScope(projectId) {
  return `design-reference-upload:${projectId}`;
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
