import { normalizeResearchResult } from "../domain/reels-research.js";
import { readJsonStorage } from "../storage/json-storage.js";

const researchStorageKey = "anton-reels-research";
const researchStorageVersion = 1;

export function createPersistedReferenceState() {
  return {
    reelsResearch: readLegacyResearch()
  };
}

export function normalizePersistedReferenceState(state = {}) {
  const normalized = {
    ...state,
    reelsResearch: hasResearchResult(state.reelsResearch)
      ? normalizeResearchResult(state.reelsResearch)
      : null
  };
  delete normalized.hookLibrary;
  return normalized;
}

export function mergeHydratedReferenceState(remoteState = {}, localState = {}) {
  const remoteResearch = hasResearchResult(remoteState.reelsResearch) ? normalizeResearchResult(remoteState.reelsResearch) : null;
  const localResearch = hasResearchResult(localState.reelsResearch) ? normalizeResearchResult(localState.reelsResearch) : null;

  const merged = {
    ...remoteState,
    reelsResearch: remoteResearch || localResearch || null
  };
  delete merged.hookLibrary;
  return merged;
}

function readLegacyResearch() {
  const result = readJsonStorage(researchStorageKey, { fallback: null, version: researchStorageVersion });
  return hasResearchResult(result) ? normalizeResearchResult(result) : null;
}

function hasResearchResult(result) {
  if (!result || typeof result !== "object") return false;
  return Boolean(
    result.modelAnalysis
    || result.modelWriting
    || (Array.isArray(result.videos) && result.videos.length)
    || (Array.isArray(result.errors) && result.errors.length)
  );
}
