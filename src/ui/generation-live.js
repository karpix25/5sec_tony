import { getProjectAutomationState } from "../domain/project-automation.js";

export function formatAutomationStats(automationState) {
  const { automation, activeJobs, completedJobs, dailyUsage, remainingProject } = automationState;
  const parts = [
    `Готово: ${completedJobs}.`,
    `В работе: ${activeJobs}.`,
    `Сегодня: ${dailyUsage?.used ?? 0}/${dailyUsage?.limit ?? 0}.`,
    `Осталось сегодня: ${dailyUsage?.remaining ?? 0}.`,
    `Остаток проекта: ${remainingProject}.`
  ];
  const message = getAutomationMessage(automation);
  if (message) parts.push(message);
  return parts.join(" ");
}

function getAutomationMessage(automation) {
  const message = String(automation?.lastMessage || "").trim();
  if (automation?.status === "done" && /Цель авторежима выполнена/i.test(message)) return "";
  return message;
}

export function updateGenerationAutomationStats(root, state, context) {
  const node = root?.querySelector?.("[data-automation-stats]");
  if (!node || !context?.project) return;
  const automationState = getProjectAutomationState({ project: context.project, jobs: state.jobs });
  node.textContent = formatAutomationStats(automationState);
}
