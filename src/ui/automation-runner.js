import { getProjectAutomationState } from "../domain/project-automation.js";
import { noAvatarCharacterId } from "../domain/avatar-selection.js";
import { createServerGenerationBatch } from "../services/generation-batches.js";

const scheduledProjects = new Set();

export function startAutomationRunner(store) {
  return startAutomationRunnerWithOptions(store);
}

export function startAutomationRunnerWithOptions(store, options = {}) {
  const run = () => scheduleAutomation(store, options);
  store.subscribe(run);
  setTimeout(run, 0);
}

function scheduleAutomation(store, options) {
  const state = store.getState();
  state.projects.forEach((project) => {
    const automationState = getProjectAutomationState({ project, jobs: state.jobs });
    if (!automationState.automation.enabled) return;
    if (scheduledProjects.has(project.id)) return;
    if (!automationState.canRun) {
      if (automationState.activeJobs > 0) return;
      if (!automationState.remainingProject) {
        markAutomation(store, project.id, "done", "Лимит проекта исчерпан. Авторежим выключен.", { enabled: false });
        return;
      }
      if (!automationState.remainingDaily) {
        markAutomation(store, project.id, "waiting", "Дневной лимит исчерпан. Авторежим включен и продолжит после обновления дневного лимита.");
      }
      return;
    }
    scheduledProjects.add(project.id);
    setTimeout(() => runAutomationBatch(store, project.id, options), 0);
  });
}

async function runAutomationBatch(store, projectId, options) {
  try {
    const state = store.getState();
    const project = state.projects.find((item) => item.id === projectId);
    const automationState = getProjectAutomationState({ project, jobs: state.jobs });
    if (!automationState.canRun) return;
    const jobs = await createAutomationBatch(store, projectId, automationState.nextCount, options);
    if (jobs.length) markAutomation(store, projectId, "running", `Запущено задач: ${jobs.length}.`);
  } catch (error) {
    markAutomation(store, projectId, "error", getAutomationErrorMessage(error), { enabled: true });
  } finally {
    scheduledProjects.delete(projectId);
  }
}

async function createAutomationBatch(store, projectId, count, options) {
  const state = store.getState();
  const requestBatch = options.createServerGenerationBatch || createServerGenerationBatch;
  const response = await requestBatch({
    count,
    distributeProducts: true,
    requireQueue: true,
    source: "automation",
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

function getAutomationErrorMessage(error) {
  const message = error?.message || "Серверная очередь недоступна";
  if (error?.code === "JOB_QUEUE_NOT_CONFIGURED") return message;
  return `${message}. Авторежим поставлен на паузу до повторного запуска.`;
}

function markAutomation(store, projectId, status, lastMessage, options = {}) {
  const project = store.getState().projects.find((item) => item.id === projectId);
  const payload = { status, lastMessage };
  if (Object.hasOwn(options, "enabled")) payload.enabled = options.enabled;
  const enabledUnchanged = !Object.hasOwn(payload, "enabled") || project?.automation?.enabled === payload.enabled;
  if (project?.automation?.status === status && project?.automation?.lastMessage === lastMessage && enabledUnchanged) return;
  store.updateProjectAutomation(projectId, payload);
}
