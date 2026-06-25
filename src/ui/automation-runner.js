import { getProjectAutomationState } from "../domain/project-automation.js";
import { getProductsForProject } from "../domain/generation.js";
import { getDesignReferences } from "../domain/references.js";
import { generateAiBrief } from "../services/brief-ai.js";
import { runImageJob } from "./job-runner.js";

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
    const jobs = await createAiAutomationJobs(store, projectId, automationState.nextCount);
    if (jobs.length) markAutomation(store, projectId, "running", `Запущено задач: ${jobs.length}.`);
    jobs.forEach((job) => runImageJob(store, job.id));
  } catch (error) {
    markAutomation(store, projectId, "paused", `${error.message || "AI-команда недоступна"}. Авторежим остановлен.`);
  } finally {
    scheduledProjects.delete(projectId);
  }
}

async function createAiAutomationJobs(store, projectId, count) {
  const jobs = [];
  for (let index = 0; index < count; index += 1) {
    const state = store.getState();
    const context = getAutomationGenerationContext(state, projectId, jobs);
    const brief = await generateAiBrief(context);
    store.updateGenerationBrief(brief);
    jobs.push(...(store.createProjectJobs(projectId, 1) || []));
  }
  return jobs;
}

function getAutomationGenerationContext(state, projectId, batchJobs) {
  const project = state.projects.find((item) => item.id === projectId) || state.projects[0];
  const projectProducts = getProductsForProject(state.products || [], project.id);
  const product = pickAutomationProduct(projectProducts, state.jobs || [], batchJobs);
  const references = getDesignReferences(project);
  return {
    project,
    product,
    reference: references.find((item) => item.id === state.selectedReferenceId) || references[0],
    existingJobs: [...(state.jobs || []).filter((job) => job.projectId === project.id), ...batchJobs],
    hookLibrary: state.hookLibrary
  };
}

function pickAutomationProduct(products, existingJobs, batchJobs) {
  if (!products.length) return null;
  const usage = new Map(products.map((product) => [product.id, 0]));
  [...existingJobs, ...batchJobs].forEach((job) => {
    if (usage.has(job.productId)) usage.set(job.productId, usage.get(job.productId) + 1);
  });
  return products.reduce((best, product) =>
    usage.get(product.id) < usage.get(best.id) ? product : best
  , products[0]);
}

function markAutomation(store, projectId, status, lastMessage) {
  const project = store.getState().projects.find((item) => item.id === projectId);
  if (project?.automation?.status === status && project?.automation?.lastMessage === lastMessage) return;
  store.updateProjectAutomation(projectId, { status, lastMessage, enabled: status === "running" });
}
