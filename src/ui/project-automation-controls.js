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
      <form id="automation-form" class="automation-form">
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
        <button class="secondary-btn" type="submit">${automation.enabled ? "Сохранить авторежим" : "Включить авторежим"}</button>
      </form>
    </section>
  `;
}

export function bindProjectAutomationControls(root, store) {
  root.querySelector("#automation-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
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
