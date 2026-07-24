import { getDesignReferences } from "../domain/references.js";
import { isNoAvatarCharacterId, noAvatarCharacterId } from "../domain/avatar-selection.js";
import { normalizeProjectDailyUsage } from "../domain/daily-usage.js";
import { getProductsForProject } from "../domain/generation.js";
import { countActiveQuotaReservations } from "../domain/job-quota.js";
import { ensureGenerationBrief } from "./factories.js";
import { createGenerationJobBatch } from "./job-batch.js";

export function getSelectionContext(state, getProject) {
  const project = getProject(state, state.selectedProjectId);
  const projectProducts = getProductsForProject(state.products, project.id);
  const product = projectProducts.find((item) => item.id === state.selectedProductId) || projectProducts[0];
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

export function getSelectionSnapshotContext(state, selection = {}, getProject) {
  const project = getProject(state, selection.projectId || state.selectedProjectId);
  const projectProducts = getProductsForProject(state.products, project.id);
  const product = projectProducts.find((item) => item.id === selection.productId) || projectProducts[0];
  const references = getDesignReferences(project);
  const selectedCharacterId = isNoAvatarCharacterId(selection.characterId) ? noAvatarCharacterId : (selection.characterId || state.selectedCharacterId);
  return {
    project,
    product,
    reference: references.find((item) => item.id === selection.referenceId) || references[0],
    character: isNoAvatarCharacterId(selectedCharacterId) ? null : project.characters.find((item) => item.id === selectedCharacterId),
    audio: state.audioLibrary.find((item) => item.id === selection.audioId) || state.audioLibrary.find((item) => item.id === state.selectedAudioId),
    audioLibrary: state.audioLibrary,
    hookLibrary: state.hookLibrary,
    reelsResearch: state.reelsResearch,
    generationBrief: ensureGenerationBrief(state.generationBrief),
    freePrompt: selection.freePrompt ?? state.freePrompt
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
  const availability = getSelectionJobBatchAvailability(state, context, count);
  if (!availability.safeCount) return [];
  return createGenerationJobBatch({
    context: { ...context, project: availability.project },
    count: availability.safeCount,
    products: options.distributeProducts ? getProductsForProject(state.products, availability.project.id) : [],
    existingJobs: availability.projectJobs,
    rotateReferences: options.rotateReferences !== false
  });
}

export function getSelectionJobBatchAvailability(state, context, count) {
  if (!context.reference) {
    return createUnavailableBatch(context, "Выберите дизайн-референс перед запуском генерации.");
  }
  const project = normalizeProjectDailyUsage(context.project);
  const projectJobs = state.jobs.filter((item) => item.projectId === project.id);
  const reserved = countActiveQuotaReservations(projectJobs);
  const dailyLeft = Math.max(0, Number(project.dailyLimit || 0) - Number(project.usedToday || 0) - reserved);
  const totalLeft = Math.max(0, Number(project.projectLimit || 0) - Number(project.usedTotal || 0) - reserved);
  const requested = Math.max(1, Number(count || 1));
  const safeCount = Math.max(0, Math.min(requested, dailyLeft, totalLeft));
  return {
    project,
    projectJobs,
    requested,
    safeCount,
    dailyLeft,
    totalLeft,
    reason: getUnavailableReason({ dailyLeft, totalLeft })
  };
}

function createUnavailableBatch(context, reason) {
  return {
    project: normalizeProjectDailyUsage(context.project || {}),
    projectJobs: [],
    requested: 0,
    safeCount: 0,
    dailyLeft: 0,
    totalLeft: 0,
    reason
  };
}

function getUnavailableReason({ dailyLeft, totalLeft }) {
  if (dailyLeft <= 0) return "Дневной лимит проекта исчерпан. Увеличьте лимит или дождитесь нового дня.";
  if (totalLeft <= 0) return "Лимит проекта исчерпан. Увеличьте общий лимит проекта, чтобы запускать новые задачи.";
  return "";
}
