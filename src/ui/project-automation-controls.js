import { escapeHtml } from "./infographic.js";
import { formatAutomationStats } from "./generation-live.js";

export function renderProjectAutomationControls(project, automationState) {
  const { automation, activeJobs, completedJobs, remainingDaily, remainingProject, remainingTarget } = automationState;
  return `
    <section class="automation-card project-automation-card">
      <div class="automation-head">
        <div>
          <span class="eyebrow">Автоматизация</span>
          <h3>Лимиты и авторежим</h3>
        </div>
      </div>
      <div class="automation-note">
        Задайте дневной лимит, лимит на весь проект и включите авторежим, чтобы система сама добирала ролики в рамках заданных границ.
      </div>
      <div id="automation-form" class="automation-form" data-automation-form>
        <input type="hidden" name="projectId" value="${escapeHtml(project.id)}">
        <label class="stacked-field compact-field">
          <span>Дневной лимит генераций</span>
          <input name="dailyLimit" class="text-input" type="number" min="1" max="500" step="1" value="${Number(project.dailyLimit || 20)}" required>
        </label>
        <label class="stacked-field compact-field">
          <span>Лимит на весь проект</span>
          <input name="projectLimit" class="text-input" type="number" min="1" max="10000" step="1" value="${Number(project.projectLimit || 500)}" required>
        </label>
        <label class="automation-toggle">
          <input name="enabled" type="checkbox" ${automation.enabled ? "checked" : ""}>
          <span>Авторежим до лимита</span>
        </label>
        <small data-automation-stats>${escapeHtml(formatAutomationStats({ automation, activeJobs, completedJobs, remainingDaily, remainingProject, remainingTarget }))}</small>
        <button id="save-automation-settings" class="secondary-btn" type="button">${automation.enabled ? "Сохранить авторежим" : "Включить авторежим"}</button>
      </div>
    </section>
  `;
}

export function bindProjectAutomationControls(root, store) {
  const panel = root.querySelector("#automation-form");
  panel?.querySelector("#save-automation-settings")?.addEventListener("click", () => {
    const payload = getAutomationPayload(panel);
    store.updateProjectSettings({
      dailyLimit: payload.dailyLimit,
      projectLimit: payload.projectLimit
    });
    const automationPayload = {
      enabled: payload.enabled === "on",
      status: payload.enabled === "on" ? "running" : "paused",
      lastMessage: payload.enabled === "on" ? "Авторежим включен." : "Авторежим остановлен."
    };
    if (Object.hasOwn(payload, "targetCount")) automationPayload.targetCount = payload.targetCount;
    if (Object.hasOwn(payload, "batchSize")) automationPayload.batchSize = payload.batchSize;
    if (Object.hasOwn(payload, "concurrency")) automationPayload.concurrency = payload.concurrency;
    store.updateProjectAutomation(payload.projectId, automationPayload);
  });
}

function getAutomationPayload(panel) {
  const payload = {
    projectId: readFieldValue(panel, "projectId"),
    dailyLimit: readFieldValue(panel, "dailyLimit"),
    projectLimit: readFieldValue(panel, "projectLimit"),
    enabled: readFieldChecked(panel, "enabled") ? "on" : undefined
  };
  ["targetCount", "batchSize", "concurrency"].forEach((name) => {
    const value = readOptionalFieldValue(panel, name);
    if (value !== undefined) payload[name] = value;
  });
  return payload;
}

function readFieldValue(panel, name) {
  return panel.querySelector(`[name="${name}"]`)?.value || "";
}

function readOptionalFieldValue(panel, name) {
  const field = panel.querySelector(`[name="${name}"]`);
  return field ? field.value : undefined;
}

function readFieldChecked(panel, name) {
  return Boolean(panel.querySelector(`[name="${name}"]`)?.checked);
}
