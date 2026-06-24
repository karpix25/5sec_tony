import { escapeHtml } from "./infographic.js";
import { projectBriefFields } from "./brief-field-labels.js";
import { renderProjectAutomationControls } from "./project-automation-controls.js";

const yandexDiskRoot = "disk:/ВИДЕО";

export function renderProjectManagementSettings({ project, automationState }) {
  const safeAutomationState = automationState || {
    automation: { enabled: false, targetCount: 10, batchSize: 1, concurrency: 1, lastMessage: "" },
    activeJobs: 0,
    completedJobs: 0,
    remainingDaily: Math.max(0, Number(project.dailyLimit || 20) - Number(project.usedToday || 0)),
    remainingProject: Math.max(0, Number(project.projectLimit || 500) - Number(project.usedTotal || 0)),
    remainingTarget: 10
  };
  return `
    <form id="project-settings-form" class="ops-form text-editor-form project-settings-form">
      <div class="project-settings-layout">
        <section class="project-core-fields">
          ${projectTextField(projectBriefFields.name.label, "name", projectBriefFields.name.placeholder, project.name)}
          ${projectYandexFolderField(project.yandexDiskFolder || yandexDiskRoot)}
          ${projectBriefField("companyAudience", project.companyAudience, false)}
          ${projectBriefField("toneOfVoice", project.toneOfVoice, false)}
          ${projectBriefField("keyScenarios", project.keyScenarios, false)}
          ${projectBriefField("audienceObjections", project.audienceObjections, false)}
          ${projectBriefField("restrictions", project.restrictions, false)}
        </section>
        <aside class="project-side-column">
          ${renderProjectAutomationControls(project, safeAutomationState)}
        </aside>
      </div>
      <div class="project-actions">
        <button id="save-project-settings" class="primary-btn" type="submit">Сохранить проект</button>
        <small id="audience-expert-status" class="ai-field-status">После сохранения AI сам обновит память проекта.</small>
      </div>
    </form>
  `;
}

function projectBriefField(name, value = "", showAi = true) {
  const field = projectBriefFields[name];
  return projectField(field.label, name, field.placeholder, value, showAi);
}

function projectTextField(label, name, placeholder, value = "") {
  return `
    <label class="stacked-field">
      <span>${escapeHtml(label)}</span>
      <input name="${escapeHtml(name)}" class="text-input" value="${escapeHtml(projectFieldText(value))}" placeholder="${escapeHtml(placeholder)}" required />
    </label>
  `;
}

function projectYandexFolderField(value = "") {
  const selected = value || yandexDiskRoot;
  return `
    <label class="stacked-field">
      <span>Папка Яндекс.Диска</span>
      <div class="yandex-folder-picker" data-yandex-folder-picker data-yandex-root="${escapeHtml(yandexDiskRoot)}">
        <input name="yandexDiskFolder" type="hidden" value="${escapeHtml(selected)}" data-yandex-folder-value>
        <div class="yandex-folder-levels" data-yandex-folder-levels></div>
      </div>
      <small class="ai-field-status" data-yandex-folder-status>Загружаем папки из ${escapeHtml(yandexDiskRoot)}</small>
    </label>
  `;
}

function projectField(label, name, placeholder, value = "", showAi = true) {
  return `
    <div class="stacked-field ai-field">
      <div class="ai-field-head">
        <label for="project-${escapeHtml(name)}">${escapeHtml(label)}</label>
        ${showAi ? `<button class="ai-field-btn" data-ai-project-field="${escapeHtml(name)}" type="button" title="Сгенерировать черновик с AI">AI</button>` : ""}
      </div>
      <textarea id="project-${escapeHtml(name)}" name="${name}" class="textarea editor-textarea" placeholder="${escapeHtml(placeholder)}">${escapeHtml(projectFieldText(value))}</textarea>
      <small class="ai-field-status" data-ai-status-for="${escapeHtml(name)}"></small>
    </div>
  `;
}

function projectFieldText(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(projectFieldText).filter(Boolean).join("\n");
  if (typeof value === "object") return Object.values(value).map(projectFieldText).filter(Boolean).join(" — ");
  return String(value);
}
