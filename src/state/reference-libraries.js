import { normalizeResearchResult } from "../domain/reels-research.js";
import { createEmptyHookLibrary, normalizeHookLibrary } from "../domain/hook-library.js";
import { readJsonStorage } from "../storage/json-storage.js";

const hookStorageKey = "anton-hook-library";
const hookStorageVersion = 1;
const researchStorageKey = "anton-reels-research";
const researchStorageVersion = 1;

export function createPersistedReferenceState() {
  return {
    hookLibrary: readLegacyHookLibrary(),
    reelsResearch: readLegacyResearch()
  };
}

export function normalizePersistedReferenceState(state = {}) {
  return {
    ...state,
    hookLibrary: normalizeHookLibrary(state.hookLibrary),
    reelsResearch: hasResearchResult(state.reelsResearch)
      ? normalizeResearchResult(state.reelsResearch)
      : null
  };
}

export function mergeHydratedReferenceState(remoteState = {}, localState = {}) {
  const remoteHookLibrary = normalizeHookLibrary(remoteState.hookLibrary);
  const localHookLibrary = normalizeHookLibrary(localState.hookLibrary);
  const useLocalHooks = !remoteHookLibrary.versions.length && localHookLibrary.versions.length;
  const remoteResearch = hasResearchResult(remoteState.reelsResearch) ? normalizeResearchResult(remoteState.reelsResearch) : null;
  const localResearch = hasResearchResult(localState.reelsResearch) ? normalizeResearchResult(localState.reelsResearch) : null;

  return {
    ...remoteState,
    hookLibrary: useLocalHooks ? localHookLibrary : remoteHookLibrary,
    reelsResearch: remoteResearch || localResearch || null
  };
}

function readLegacyHookLibrary() {
  return normalizeHookLibrary(readJsonStorage(hookStorageKey, {
    fallback: createEmptyHookLibrary(),
    version: hookStorageVersion
  }));
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
