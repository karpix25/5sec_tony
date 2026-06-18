import { getProjectAutomationState } from "../domain/project-automation.js";

export function formatAutomationStats(automationState) {
  const { automation, activeJobs, completedJobs, remainingDaily, remainingProject, remainingTarget } = automationState;
  const parts = [
    `Готово: ${completedJobs}.`,
    `В работе: ${activeJobs}.`,
    `До цели: ${remainingTarget}.`,
    `Дневной остаток: ${remainingDaily}.`,
    `Остаток проекта: ${remainingProject}.`
  ];
  const message = String(automation?.lastMessage || "").trim();
  if (message) parts.push(message);
  return parts.join(" ");
}

export function updateGenerationAutomationStats(root, state, context) {
  const node = root?.querySelector?.("[data-automation-stats]");
  if (!node || !context?.project) return;
  const automationState = getProjectAutomationState({ project: context.project, jobs: state.jobs });
  node.textContent = formatAutomationStats(automationState);
}
