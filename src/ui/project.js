import { escapeHtml } from "./infographic.js";

const yandexDiskRoot = "disk:/ВИДЕО";

export function renderProjectManagementSettings({ project }) {
  return `
    <form id="project-settings-form" class="ops-form text-editor-form project-settings-form">
      <section class="project-core-fields">
        ${projectTextField("Название проекта", "name", "Например: БАДы / Beauty / Плати по миру", project.name)}
        ${projectYandexFolderField(project.yandexDiskFolder || yandexDiskRoot)}
        ${projectTextField("Подпись экспорта", "exportFolder", "Как показывать папку в интерфейсе", project.exportFolder)}
        ${projectField("О проекте", "projectTheme", "Что это за проект, что продаем, кому помогаем, чем отличаемся, какие факты важны.", project.projectTheme || project.companyInfo, false)}
        ${projectField("ЦА компании", "companyAudience", "Кто покупает, какие сегменты важны, что уже известно об аудитории.", project.companyAudience, false)}
        ${projectField("Ограничения проекта", "restrictions", "Что нельзя обещать, юридические/медицинские/финансовые рамки.", project.restrictions, false)}
      </section>
      <div class="project-actions">
        <button id="save-project-settings" class="primary-btn" type="submit">Сохранить проект</button>
        <small id="audience-expert-status" class="ai-field-status">После сохранения AI сам обновит память проекта.</small>
      </div>
    </form>
  `;
}

export function renderYandexFolderOptions(folders = [], selectedPath = "") {
  const selected = selectedPath || yandexDiskRoot;
  const values = [...new Set([selected, ...folders].filter(Boolean))];
  return values.map((folder) =>
    `<option value="${escapeHtml(folder)}" ${folder === selected ? "selected" : ""}>${escapeHtml(folder)}</option>`
  ).join("");
}

export function setYandexFolderOptions(select, folders = []) {
  if (!select) return;
  select.innerHTML = renderYandexFolderOptions(folders, select.value || yandexDiskRoot);
}

function projectTextField(label, name, placeholder, value = "") {
  return `
    <label class="stacked-field">
      <span>${escapeHtml(label)}</span>
      <input name="${escapeHtml(name)}" class="text-input" value="${escapeHtml(value || "")}" placeholder="${escapeHtml(placeholder)}" required />
    </label>
  `;
}

function projectYandexFolderField(value = "") {
  const selected = value || yandexDiskRoot;
  return `
    <label class="stacked-field">
      <span>Папка Яндекс.Диска</span>
      <select name="yandexDiskFolder" class="select" data-yandex-folder-select data-yandex-root="${escapeHtml(yandexDiskRoot)}" required>
        ${renderYandexFolderOptions([], selected)}
      </select>
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
      <textarea id="project-${escapeHtml(name)}" name="${name}" class="textarea editor-textarea" placeholder="${escapeHtml(placeholder)}">${escapeHtml(value || "")}</textarea>
      <small class="ai-field-status" data-ai-status-for="${escapeHtml(name)}"></small>
    </div>
  `;
}
