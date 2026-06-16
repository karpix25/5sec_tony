import { readJsonStorage, writeJsonStorage } from "../storage/json-storage.js";

const uiCacheVersion = 1;

export function readUiCache(storageKey, fallback = {}) {
  return readJsonStorage(storageKey, {
    fallback,
    version: uiCacheVersion
  });
}

export function saveUiCache(storageKey, state) {
  return writeJsonStorage(storageKey, pickUiCacheState(state), {
    version: uiCacheVersion
  });
}

export function applyUiCache(baseState, uiCache = {}) {
  return {
    ...baseState,
    ...pickDefinedUiCache(uiCache)
  };
}

export function mergeHydratedStateWithUiState(nextState, currentUiState = {}) {
  return {
    ...nextState,
    ...pickDefinedUiCache(currentUiState)
  };
}

export function pickUiCacheState(state = {}) {
  return {
    selectedProjectId: state.selectedProjectId || "",
    selectedProductId: state.selectedProductId || "",
    selectedReferenceId: state.selectedReferenceId || "",
    selectedCharacterId: state.selectedCharacterId || "",
    selectedAudioId: state.selectedAudioId || "",
    selectedProjectTab: state.selectedProjectTab || "project",
    generationBrief: state.generationBrief || {},
    freePrompt: state.freePrompt || ""
  };
}

function pickDefinedUiCache(uiCache) {
  return Object.fromEntries(
    Object.entries(pickUiCacheState(uiCache)).filter(([, value]) => value !== undefined)
  );
}
