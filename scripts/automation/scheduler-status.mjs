import { normalizeProjectAutomation } from "../../src/domain/project-automation.js";
import { updateGenerationState } from "../generation-state.mjs";

export async function markAutomationStatus(projectId, patch, deps = {}) {
  const updateState = deps.updateGenerationState || updateGenerationState;
  await updateState((state) => ({
    ...state,
    projects: (state.projects || []).map((project) => {
      if (project.id !== projectId) return project;
      return {
        ...project,
        automation: normalizeProjectAutomation({ ...(project.automation || {}), ...patch })
      };
    })
  }), deps);
}

export function getAutomationErrorMessage(error) {
  const message = error?.message || "Серверная очередь недоступна";
  if (error?.code === "JOB_QUEUE_NOT_CONFIGURED") return message;
  return `${message}. Авторежим поставлен на паузу до повторного запуска.`;
}
