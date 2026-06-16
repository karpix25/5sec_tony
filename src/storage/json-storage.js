const envelopeMarker = "anton-json-storage";

export function readJsonStorage(key, options = {}) {
  const fallback = options.fallback ?? null;
  const storage = getBrowserStorage();
  if (!storage) return fallback;

  const raw = safeGet(storage, key);
  if (!raw) return fallback;

  try {
    const parsed = JSON.parse(raw);
    return unwrapStoredValue(parsed, options);
  } catch (error) {
    backupCorruptValue(storage, key, raw);
    reportStorageIssue("read", key, error);
    return fallback;
  }
}

export function writeJsonStorage(key, value, options = {}) {
  const storage = getBrowserStorage();
  if (!storage) return { ok: false, reason: "unavailable" };

  const payload = {
    __storage: envelopeMarker,
    version: Number(options.version || 1),
    savedAt: new Date().toISOString(),
    data: value
  };

  try {
    storage.setItem(key, JSON.stringify(payload));
    return { ok: true };
  } catch (error) {
    reportStorageIssue("write", key, error);
    return { ok: false, reason: error?.name || "write_failed" };
  }
}

export function removeJsonStorage(key) {
  const storage = getBrowserStorage();
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch (error) {
    reportStorageIssue("remove", key, error);
  }
}

function unwrapStoredValue(parsed, options) {
  const targetVersion = Number(options.version || 1);
  if (isStorageEnvelope(parsed)) {
    const sourceVersion = Number(parsed.version || 1);
    return sourceVersion === targetVersion
      ? parsed.data
      : migrateStoredValue(parsed.data, sourceVersion, targetVersion, options);
  }
  return migrateStoredValue(parsed, 0, targetVersion, options);
}

function migrateStoredValue(value, fromVersion, toVersion, options) {
  if (typeof options.migrate !== "function") return value;
  return options.migrate(value, { fromVersion, toVersion });
}

function isStorageEnvelope(value) {
  return Boolean(value && typeof value === "object" && value.__storage === envelopeMarker && "data" in value);
}

function backupCorruptValue(storage, key, raw) {
  try {
    storage.setItem(`${key}:corrupt:${Date.now()}`, raw.slice(0, 250000));
    storage.removeItem(key);
  } catch {}
}

function getBrowserStorage() {
  if (typeof window === "undefined" || !window.localStorage) return null;
  return window.localStorage;
}

function safeGet(storage, key) {
  try {
    return storage.getItem(key);
  } catch (error) {
    reportStorageIssue("read", key, error);
    return null;
  }
}

function reportStorageIssue(action, key, error) {
  if (typeof console === "undefined" || typeof console.warn !== "function") return;
  console.warn(`[storage:${action}] ${key}: ${error?.message || error || "unknown error"}`);
}
