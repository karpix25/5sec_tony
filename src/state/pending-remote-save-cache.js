import { readJsonStorage, removeJsonStorage, writeJsonStorage } from "../storage/json-storage.js";
import { compactStateForPendingRemoteSave, prepareStateForRemoteSave } from "./pending-remote-save-state.js";

export function readPendingRemoteSave(storageKey, storageVersion, normalize) {
  const pending = readJsonStorage(storageKey, {
    fallback: null,
    version: storageVersion
  });
  if (!isPendingRemoteSave(pending)) return null;
  const compacted = compactPendingRemoteSave(pending);
  return {
    baseUpdatedAt: compacted.baseUpdatedAt || "",
    changedKeys: Array.isArray(compacted.changedKeys) ? compacted.changedKeys : [],
    state: typeof normalize === "function" ? normalize(compacted.state) : compacted.state
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
  const prepared = prepareStateForRemoteSave(pending.state, pending.changedKeys);
  return {
    ...pending,
    state: compactStateForPendingRemoteSave(prepared.state)
  };
}

function isPendingRemoteSave(value) {
  return Boolean(value && typeof value === "object" && value.state && typeof value.state === "object");
}
