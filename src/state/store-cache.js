import { createInitialState } from "./initial-state.js";
import {
  clearStateFromLocalCache,
  readStateFromLocalCache,
  saveStateToLocalCache
} from "./local-cache-state.js";
import { applyUiCache, readUiCache, saveUiCache } from "./ui-cache-state.js";

const uiCacheKey = "anton-5-sec-ui-cache";
const localProjectStateKey = "anton-5-sec-project-state";
const legacyProjectStateKey = "anton-5-sec-state";
const storageVersion = 1;

export function createStoreCache(normalize) {
  const fallbackProjectState = readProjectFallbackState(storageVersion);
  let backupLocalProjectState = false;

  return {
    createInitialStoreState() {
      return normalize(applyUiCache(createInitialState(), readUiCache(uiCacheKey)));
    },
    getFallbackProjectState() {
      return fallbackProjectState ? normalize(fallbackProjectState) : null;
    },
    persist(state) {
      saveUiCache(uiCacheKey, state);
      if (backupLocalProjectState) saveStateToLocalCache(localProjectStateKey, storageVersion, state);
    },
    markRemoteHealthy() {
      backupLocalProjectState = false;
      clearStateFromLocalCache(localProjectStateKey);
      clearStateFromLocalCache(legacyProjectStateKey);
    },
    markRemoteUnavailable(state) {
      backupLocalProjectState = true;
      if (state) saveStateToLocalCache(localProjectStateKey, storageVersion, state);
    }
  };
}

function readProjectFallbackState(storageVersion) {
  return readStateFromLocalCache(localProjectStateKey, storageVersion, null)
    || readStateFromLocalCache(legacyProjectStateKey, storageVersion, null)
    || null;
}
