import { createInitialState } from "./initial-state.js";
import {
  clearStateFromLocalCache,
  readStateFromLocalCache,
  saveStateToLocalCache
} from "./local-cache-state.js";
import { applyUiCache, readUiCache, saveUiCache } from "./ui-cache-state.js";
import {
  clearPendingRemoteSave,
  readPendingRemoteSave,
  savePendingRemoteSave
} from "./pending-remote-save-cache.js";

const uiCacheKey = "anton-5-sec-ui-cache";
const localProjectStateKey = "anton-5-sec-project-state";
const legacyProjectStateKey = "anton-5-sec-state";
const pendingRemoteSaveKey = "anton-5-sec-pending-remote-save";
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
    getPendingRemoteSaveHooks() {
      return {
        getPendingRemoteSave: () => readPendingRemoteSave(pendingRemoteSaveKey, storageVersion, normalize),
        savePendingRemoteSave: (state, baseUpdatedAt) => savePendingRemoteSave(pendingRemoteSaveKey, storageVersion, state, baseUpdatedAt),
        clearPendingRemoteSave: () => clearPendingRemoteSave(pendingRemoteSaveKey)
      };
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
