import { readJsonStorage, removeJsonStorage, writeJsonStorage } from "../storage/json-storage.js";
import { compactStateForLocalCache } from "./local-cache-state.js";
import { compactStateForPendingRemoteSave } from "./pending-remote-save-state.js";

export function readPendingRemoteSave(storageKey, storageVersion, normalize) {
  const pending = readJsonStorage(storageKey, {
    fallback: null,
    version: storageVersion
  });
  if (!isPendingRemoteSave(pending)) return null;
  return {
    baseUpdatedAt: pending.baseUpdatedAt || "",
    changedKeys: Array.isArray(pending.changedKeys) ? pending.changedKeys : [],
    state: typeof normalize === "function" ? normalize(pending.state) : pending.state
  };
}

export function savePendingRemoteSave(storageKey, storageVersion, state, baseUpdatedAt, changedKeys = []) {
  return writeJsonStorage(storageKey, {
    baseUpdatedAt: baseUpdatedAt || "",
    changedKeys: Array.isArray(changedKeys) ? changedKeys : [],
    state
  }, {
    version: storageVersion,
    compactValue: compactPendingRemoteSave
  });
}

export function clearPendingRemoteSave(storageKey) {
  removeJsonStorage(storageKey);
}

function compactPendingRemoteSave(pending) {
  if (!isPendingRemoteSave(pending)) return pending;
  return {
    ...pending,
    state: compactStateForPendingRemoteSave(compactStateForLocalCache(pending.state))
  };
}

function isPendingRemoteSave(value) {
  return Boolean(value && typeof value === "object" && value.state && typeof value.state === "object");
}
