import { escapeHtml } from "./infographic.js";
import { formatAutomationStats } from "./generation-live.js";

export function renderProjectAutomationControls(project, automationState) {
  const { automation, activeJobs, completedJobs, remainingProject } = automationState;
  const statusView = getAutomationStatusView(automationState);
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
        <small data-automation-stats>${escapeHtml(formatAutomationStats({ automation, activeJobs, completedJobs, remainingProject }))}</small>
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

function getAutomationStatusView(automationState) {
  const { automation, activeJobs, remainingDaily, remainingProject, canRun } = automationState;
  if (automation?.enabled && activeJobs > 0) return { label: "В работе", tone: "running" };
  if (automation?.enabled && !remainingProject) return { label: "Лимит проекта", tone: "paused" };
  if (automation?.enabled && !remainingDaily) return { label: "Лимит дня", tone: "idle" };
  if (automation?.enabled && canRun) return { label: "Включен", tone: "running" };
  if (automation?.enabled) return { label: "Ждет", tone: "idle" };
  if (automation?.status === "done") return { label: "Лимит проекта", tone: "paused" };
  if (automation?.status === "paused") return { label: "Остановлен", tone: "paused" };
  return { label: "Выключен", tone: "idle" };
}

function readFieldValue(panel, name) {
  return panel.querySelector(`[name="${name}"]`)?.value || "";
}
