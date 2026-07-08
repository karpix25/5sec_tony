import { escapeHtml } from "./infographic.js";
import { formatAutomationStats } from "./generation-live.js";

export function renderProjectAutomationControls(project, automationState) {
  const { automation, activeJobs, completedJobs, remainingDaily, remainingProject, remainingTarget } = automationState;
  const statusView = getAutomationStatusView(automation);
  const nextEnabled = !automation.enabled;
  return `
    <section class="automation-card project-automation-card">
      <div class="automation-head">
        <div>
          <span class="eyebrow">Автоматизация</span>
          <h3>Лимиты и авторежим</h3>
        </div>
        <span class="automation-status" data-tone="${statusView.tone}">${escapeHtml(statusView.label)}</span>
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
        <small data-automation-stats>${escapeHtml(formatAutomationStats({ automation, activeJobs, completedJobs, remainingDaily, remainingProject, remainingTarget }))}</small>
        <button
          id="toggle-automation-mode"
          class="${automation.enabled ? "ghost-btn" : "secondary-btn"}"
          type="button"
          data-next-enabled="${nextEnabled ? "true" : "false"}"
        >${automation.enabled ? "Остановить авторежим" : "Включить авторежим"}</button>
      </div>
    </section>
  `;
}

export function bindProjectAutomationControls(root, store) {
  const panel = root.querySelector("#automation-form");
  panel?.querySelector("#toggle-automation-mode")?.addEventListener("click", (event) => {
    const projectId = readFieldValue(panel, "projectId");
    const enabled = event.currentTarget?.dataset?.nextEnabled === "true";
    const automationPayload = {
      enabled,
      status: enabled ? "running" : "paused",
      lastMessage: enabled ? "Авторежим включен." : "Авторежим остановлен."
    };
    store.updateProjectAutomation(projectId, automationPayload);
  });
}

function getAutomationStatusView(automation) {
  const status = automation?.status || "";
  if (automation?.enabled) return { label: "Активен", tone: "running" };
  if (status === "done") return { label: "Цель готова", tone: "done" };
  if (status === "paused") return { label: "Остановлен", tone: "paused" };
  return { label: "Выключен", tone: "idle" };
}

function readFieldValue(panel, name) {
  return panel.querySelector(`[name="${name}"]`)?.value || "";
}
