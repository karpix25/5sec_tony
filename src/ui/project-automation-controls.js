import { escapeHtml } from "./infographic.js";

export function renderProjectAutomationControls(project, automationState) {
  const { automation } = automationState;
  const statusView = getAutomationStatusView(automationState);
  const canRetryError = automation.enabled && automation.status === "error";
  const nextEnabled = !automation.enabled || canRetryError;
  const buttonLabel = getAutomationButtonLabel(automation, canRetryError);
  const note = getAutomationNote(automation);
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
        <div class="automation-grid">
          <label class="stacked-field compact-field">
            <span>Дневной лимит генераций</span>
            <input name="dailyLimit" class="text-input" type="number" min="1" max="500" step="1" value="${Number(project.dailyLimit || 20)}" required>
          </label>
          <label class="stacked-field compact-field">
            <span>Лимит на весь проект</span>
            <input name="projectLimit" class="text-input" type="number" min="1" max="10000" step="1" value="${Number(project.projectLimit || 500)}" required>
          </label>
        </div>
        ${note ? `<small class="automation-note">${escapeHtml(note)}</small>` : ""}
        <button
          id="toggle-automation-mode"
          class="${automation.enabled ? "ghost-btn" : "secondary-btn"}"
          type="button"
          data-next-enabled="${nextEnabled ? "true" : "false"}"
        >${buttonLabel}</button>
      </div>
    </section>
  `;
}

export function bindProjectAutomationControls(root, store) {
  const panel = root.querySelector("#automation-form");
  panel?.addEventListener("change", () => {
    const projectSettings = readLimitSettings(panel);
    if (Object.keys(projectSettings).length) {
      const saveProjectSettings = store.updateProjectSettingsRemote || store.updateProjectSettings;
      Promise.resolve(saveProjectSettings?.(projectSettings)).catch((error) => {
        console.warn("[project-automation] limit save failed", error);
      });
    }
  });
  panel?.querySelector("#toggle-automation-mode")?.addEventListener("click", (event) => {
    const projectId = readFieldValue(panel, "projectId");
    const enabled = event.currentTarget?.dataset?.nextEnabled === "true";
    const automationPayload = {
      enabled,
      status: enabled ? "running" : "paused",
      lastMessage: enabled ? "Авторежим включен." : "Авторежим остановлен."
    };
    const saveAutomation = store.updateProjectAutomationRemote || store.updateProjectAutomation;
    Promise.resolve(saveAutomation?.(projectId, automationPayload)).catch((error) => {
      console.warn("[project-automation] automation save failed", error);
    });
  });
}

function getAutomationStatusView(automationState) {
  const { automation, activeJobs, remainingDaily, remainingProject, canRun } = automationState;
  if (automation?.status === "error") return { label: "Ошибка очереди", tone: "paused" };
  if (automation?.status === "dispatching") return { label: "Подготовка", tone: "running" };
  if (automation?.enabled && !remainingProject) return { label: "Лимит проекта", tone: "paused" };
  if (automation?.enabled && activeJobs > 0) return { label: "В работе", tone: "running" };
  if (automation?.enabled && !remainingDaily) return { label: "Лимит дня", tone: "idle" };
  if (automation?.enabled && canRun) return { label: "Включен", tone: "running" };
  if (automation?.enabled) return { label: "Ждет", tone: "idle" };
  if (automation?.status === "done" && !remainingProject) return { label: "Лимит проекта", tone: "paused" };
  if (automation?.status === "paused") return { label: "Остановлен", tone: "paused" };
  return { label: "Выключен", tone: "idle" };
}

function getAutomationButtonLabel(automation, canRetryError) {
  if (canRetryError) return "Повторить авторежим";
  return automation.enabled ? "Остановить авторежим" : "Включить авторежим";
}

function getAutomationNote(automation) {
  const message = String(automation?.lastMessage || "").trim();
  if (automation?.status === "error") return message;
  if (automation?.status === "waiting") return "Авторежим продолжит после обновления дневного лимита.";
  if (automation?.status === "done" && /Лимит проекта исчерпан/i.test(message)) return "Лимит проекта исчерпан.";
  if (automation?.status === "done" && /Цель авторежима выполнена/i.test(message)) return "";
  return "";
}

function readFieldValue(panel, name) {
  return panel.querySelector(`[name="${name}"]`)?.value || "";
}

function readLimitSettings(panel) {
  return Object.fromEntries(
    ["dailyLimit", "projectLimit"]
      .map((name) => [name, readOptionalNumberField(panel, name)])
      .filter(([, value]) => value !== null)
  );
}

function readOptionalNumberField(panel, name) {
  const raw = readFieldValue(panel, name).trim();
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}
