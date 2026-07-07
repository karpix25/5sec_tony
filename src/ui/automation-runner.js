import { getProjectAutomationState } from "../domain/project-automation.js";
import { noAvatarCharacterId } from "../domain/avatar-selection.js";
import { createServerGenerationBatch } from "../services/generation-batches.js";

const scheduledProjects = new Set();

export function startAutomationRunner(store) {
  const run = () => scheduleAutomation(store);
  store.subscribe(run);
  setTimeout(run, 0);
}

function scheduleAutomation(store) {
  const state = store.getState();
  state.projects.forEach((project) => {
    const automationState = getProjectAutomationState({ project, jobs: state.jobs });
    if (!automationState.automation.enabled) return;
    if (scheduledProjects.has(project.id)) return;
    if (!automationState.canRun) {
      if (automationState.activeJobs > 0) return;
      if (!automationState.remainingDaily) markAutomation(store, project.id, "paused", "Дневной лимит исчерпан.");
      if (!automationState.remainingProject) markAutomation(store, project.id, "paused", "Лимит проекта исчерпан.");
      if (!automationState.remainingTarget) markAutomation(store, project.id, "done", "Цель авторежима выполнена.");
      return;
    }
    scheduledProjects.add(project.id);
    setTimeout(() => runAutomationBatch(store, project.id), 0);
  });
}

async function runAutomationBatch(store, projectId) {
  try {
    const state = store.getState();
    const project = state.projects.find((item) => item.id === projectId);
    const automationState = getProjectAutomationState({ project, jobs: state.jobs });
    if (!automationState.canRun) return;
    const jobs = await createAutomationBatch(store, projectId, automationState.nextCount);
    if (jobs.length) markAutomation(store, projectId, "running", `Запущено задач: ${jobs.length}.`);
  } catch (error) {
    markAutomation(store, projectId, "paused", `${error.message || "Серверная очередь недоступна"}. Авторежим остановлен.`);
  } finally {
    scheduledProjects.delete(projectId);
  }
}

async function createAutomationBatch(store, projectId, count) {
  const state = store.getState();
  const response = await createServerGenerationBatch({
    count,
    distributeProducts: true,
    selection: {
      projectId,
      productId: "",
      referenceId: state.selectedReferenceId || "",
      characterId: state.selectedCharacterId || noAvatarCharacterId,
      audioId: state.selectedAudioId || "",
      freePrompt: state.freePrompt || ""
    }
  });
  return store.mergeServerJobs(response.jobs || []);
}

function markAutomation(store, projectId, status, lastMessage) {
  const project = store.getState().projects.find((item) => item.id === projectId);
  if (project?.automation?.status === status && project?.automation?.lastMessage === lastMessage) return;
  store.updateProjectAutomation(projectId, { status, lastMessage, enabled: status === "running" });
}
