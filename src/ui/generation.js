import { escapeHtml, renderInfographicPreview } from "./infographic.js";
import { getDesignReferences } from "../domain/references.js";
import { getProjectAutomationState } from "../domain/project-automation.js";
import { runImageJob } from "./job-runner.js";

export function renderStudioPanel(state, context) {
  const automationState = getProjectAutomationState({ project: context.project, jobs: state.jobs });
  return `
    <section class="embedded-panel studio-panel">
      <div class="panel-head">
        <div><span class="eyebrow">Автогенерация</span><h2>Генерация инфографики</h2></div>
        <button id="create-job" class="primary-btn" type="button">Запустить</button>
      </div>
      <div class="studio-layout">
        <div class="controls generation-controls">
          ${renderReferenceSelect(context)}
          ${renderCharacterSelect(context)}
          ${renderAudioSelect(context)}
          <div class="auto-generation-note">
            Система сама подберет тему, хук, формат и объекты на основе проекта, продукта, референсов и истории генераций.
          </div>
          <label class="stacked-field">
            <span>Количество</span>
            <input id="generation-count" class="text-input" type="number" min="1" max="10" value="1" />
          </label>
          ${renderAutomationControls(context.project, automationState)}
        </div>
        <div class="preview-wrap">
          ${renderInfographicPreview(context)}
          <div class="approval-row">
            <button class="secondary-btn" type="button">Открыть превью</button>
            <button class="ghost-btn" type="button">Повторить</button>
          </div>
        </div>
      </div>
    </section>
  `;
}

export function bindGenerationPanelEvents(root, store) {
  root.querySelector("#create-job")?.addEventListener("click", () => {
    const count = Math.max(1, Math.min(10, Number(root.querySelector("#generation-count")?.value || 1)));
    const jobs = store.createJobs(count);
    store.selectProjectTab("queue");
    jobs.forEach((job) => runImageJob(store, job.id));
  });
  root.querySelector("#automation-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    store.updateProjectAutomation(payload.projectId, {
      enabled: payload.enabled === "on",
      targetCount: payload.targetCount,
      batchSize: payload.batchSize,
      concurrency: payload.concurrency,
      status: payload.enabled === "on" ? "running" : "paused",
      lastMessage: payload.enabled === "on" ? "Авторежим включен." : "Авторежим остановлен."
    });
  });
}

function renderReferenceSelect({ project, reference }) {
  const references = getDesignReferences(project);
  return `
    <label class="field-label" for="reference-select">Референс визуального стиля</label>
    <select id="reference-select" class="select">
      ${references.map((item) => briefOption(item.id, item.title, reference?.id)).join("")}
    </select>
  `;
}

function renderCharacterSelect({ project, character }) {
  return `
    <label class="field-label" for="character-select">Персонаж проекта</label>
    <select id="character-select" class="select">
      ${project.characters.map((item) => briefOption(item.id, `${item.name} · ${characterStatusLabel(item.status)}`, character?.id)).join("")}
    </select>
  `;
}

function renderAudioSelect({ audioLibrary, audio }) {
  return `
    <label class="field-label" for="audio-select">Глобальное аудио</label>
    <select id="audio-select" class="select">
      ${audioLibrary.map((item) => briefOption(item.id, item.title, audio?.id)).join("")}
    </select>
  `;
}

function renderAutomationControls(project, automationState) {
  const { automation, activeJobs, completedJobs, remainingDaily, remainingProject, remainingTarget } = automationState;
  return `
    <form id="automation-form" class="automation-card">
      <input type="hidden" name="projectId" value="${escapeHtml(project.id)}">
      <label class="automation-toggle">
        <input name="enabled" type="checkbox" ${automation.enabled ? "checked" : ""}>
        <span>Авторежим до лимита</span>
      </label>
      <div class="automation-grid">
        ${automationNumberField("targetCount", "Цель роликов", automation.targetCount, 1, 500)}
        ${automationNumberField("batchSize", "Пакет", automation.batchSize, 1, 10)}
        ${automationNumberField("concurrency", "Параллельно", automation.concurrency, 1, 5)}
      </div>
      <small>
        Готово: ${completedJobs}. В работе: ${activeJobs}. До цели: ${remainingTarget}. Дневной остаток: ${remainingDaily}. Остаток проекта: ${remainingProject}.
        ${escapeHtml(automation.lastMessage || "")}
      </small>
      <button class="secondary-btn" type="submit">${automation.enabled ? "Сохранить авторежим" : "Включить авторежим"}</button>
    </form>
  `;
}

function automationNumberField(name, label, value, min, max) {
  return `
    <label class="stacked-field compact-field">
      <span>${escapeHtml(label)}</span>
      <input name="${name}" class="text-input" type="number" min="${min}" max="${max}" value="${Number(value)}">
    </label>
  `;
}

function briefOption(id, label, selectedId) {
  return `<option value="${id}" ${id === selectedId ? "selected" : ""}>${escapeHtml(label)}</option>`;
}

function characterStatusLabel(status) {
  if (status === "approved") return "готов";
  if (status === "draft") return "черновик";
  return "в работе";
}
