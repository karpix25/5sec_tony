import { noAvatarCharacterId } from "./avatar-selection.js";
import { normalizeDirectionIds } from "./product-content-directions.js";

const maxGenerationBatchCount = 10;

export function createGenerationBatchId() {
  return `batch-${Date.now().toString(36)}-${createBatchToken()}`;
}

export function normalizeGenerationCount(count) {
  return Math.max(1, Math.min(maxGenerationBatchCount, Number(count || 1)));
}

export function normalizeGenerationBatchId(value) {
  const batchId = String(value || "").trim();
  return /^batch-[a-zA-Z0-9_-]{8,80}$/.test(batchId) ? batchId : "";
}

export function normalizeGenerationBatchReservation(reservation = {}, count = 1) {
  return {
    batchId: normalizeGenerationBatchId(reservation.batchId),
    jobIds: normalizeGenerationJobIds(reservation.jobIds, normalizeGenerationCount(count))
  };
}

export function normalizeGenerationSelection(selection = {}) {
  return {
    projectId: selection.projectId || "",
    productId: selection.productId || "",
    referenceId: selection.referenceId || "",
    characterId: selection.characterId || noAvatarCharacterId,
    audioId: selection.audioId || "",
    freePrompt: selection.freePrompt || "",
    contentDirectionIds: normalizeDirectionIds(selection.contentDirectionIds)
  };
}

function normalizeGenerationJobIds(values = [], count = 1) {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => String(value || "").trim())
    .filter((value) => /^job-[a-zA-Z0-9_-]{8,120}$/.test(value))
    .slice(0, count);
}

function createBatchToken() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID().slice(0, 18);
  return Math.random().toString(36).slice(2, 12);
}
