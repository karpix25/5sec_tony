import { getDesignReferences } from "../domain/references.js";
import { isNoAvatarCharacterId, noAvatarCharacterId } from "../domain/avatar-selection.js";
import { getProductsForProject } from "../domain/generation.js";
import { countActiveQuotaReservations } from "../domain/job-quota.js";
import { ensureGenerationBrief } from "./factories.js";
import { createGenerationJobBatch } from "./job-batch.js";

export function getSelectionContext(state, getProject) {
  const project = getProject(state, state.selectedProjectId);
  const product = state.products.find((item) => item.id === state.selectedProductId) || getProductsForProject(state.products, project.id)[0];
  const references = getDesignReferences(project);
  const selectedCharacterId = isNoAvatarCharacterId(state.selectedCharacterId) ? noAvatarCharacterId : state.selectedCharacterId;
  return {
    project,
    product,
    reference: references.find((item) => item.id === state.selectedReferenceId) || references[0],
    character: isNoAvatarCharacterId(selectedCharacterId) ? null : project.characters.find((item) => item.id === selectedCharacterId),
    audio: state.audioLibrary.find((item) => item.id === state.selectedAudioId),
    audioLibrary: state.audioLibrary,
    hookLibrary: state.hookLibrary,
    reelsResearch: state.reelsResearch,
    generationBrief: ensureGenerationBrief(state.generationBrief),
    freePrompt: state.freePrompt
  };
}

export function getProjectSelectionContext(state, projectId, getProject) {
  const fallback = getSelectionContext(state, getProject);
  const project = getProject(state, projectId);
  const projectProducts = getProductsForProject(state.products, project.id);
  const product = projectProducts.find((item) => item.id === state.selectedProductId) || projectProducts[0] || fallback.product;
  const references = getDesignReferences(project);
  const reference = references.find((item) => item.id === state.selectedReferenceId) || references[0] || fallback.reference;
  const character = isNoAvatarCharacterId(state.selectedCharacterId)
    ? null
    : project.characters.find((item) => item.id === state.selectedCharacterId) || project.characters[0] || fallback.character;
  return { ...fallback, project, product, reference, character };
}

export function createSelectionJobBatch(state, context, count, options = {}) {
  const projectJobs = state.jobs.filter((item) => item.projectId === context.project.id);
  const reserved = countActiveQuotaReservations(projectJobs);
  const dailyLeft = Math.max(0, Number(context.project.dailyLimit || 0) - Number(context.project.usedToday || 0) - reserved);
  const totalLeft = Math.max(0, Number(context.project.projectLimit || 0) - Number(context.project.usedTotal || 0) - reserved);
  const safeCount = Math.max(0, Math.min(Number(count || 1), dailyLeft, totalLeft));
  if (!safeCount) return [];
  return createGenerationJobBatch({
    context,
    count: safeCount,
    products: options.distributeProducts ? getProductsForProject(state.products, context.project.id) : [],
    existingJobs: projectJobs
  });
}
