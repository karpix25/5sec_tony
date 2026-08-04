const JOB_STATUS_FIELDS = [
  "id",
  "projectId",
  "productId",
  "characterId",
  "status",
  "stage",
  "progress",
  "title",
  "topic",
  "music",
  "referenceTitle",
  "outputType",
  "finalVideoUrl",
  "finalVideoHasAudio",
  "queueName",
  "queueStatus",
  "queuePriority",
  "queueAttempts",
  "queueMaxAttempts",
  "queueScheduledAt",
  "queueLockedAt",
  "queueLastError",
  "queueIdempotencyKey",
  "queueProviderTaskId",
  "createdAt",
  "updatedAt",
  "completedAt",
  "finishedAt",
  "failedAt",
  "failMsg"
];

const HEAVY_KEY = /(?:prompt|image(?:$|data|url|base64|blob|thumbnail|preview)|base64|filedata|dataurl|blob|thumbnail|preview|serverjobcontext|aitrace|inputurls|inputrefs|contentscript|creativebrief|visualbrief|finalcontent)/i;
const EMBEDDED_ASSET = /^data:[^;]+;base64,/i;
const DEFAULT_TEXT_LIMIT = 2000;

export function compactLegacyState(state, options = {}) {
  if (state == null) return state;
  if (!isPlainObject(state)) throw new TypeError("State must be a plain object");

  const seen = new WeakSet();
  const compacted = compactObject(state, seen, options);
  compacted.projects = compactCollection(state.projects, seen, options);
  compacted.products = compactCollection(state.products, seen, options);
  compacted.jobs = Array.isArray(state.jobs)
    ? state.jobs.map((job) => compactJob(job, options)).filter(Boolean)
    : [];
  return compacted;
}

export function estimateJsonBytes(value) {
  if (value === undefined) return 0;
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function compactJob(job, options) {
  if (!isPlainObject(job)) return null;
  const compacted = {};
  for (const field of JOB_STATUS_FIELDS) {
    if (!hasOwn(job, field) || isHeavyKey(field, job[field])) continue;
    const value = compactValue(job[field], new WeakSet(), options);
    if (value !== undefined) compacted[field] = value;
  }
  return compacted;
}

function compactCollection(value, seen, options) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => compactValue(item, seen, options)).filter((item) => item !== undefined);
}

function compactObject(value, seen, options) {
  if (!isPlainObject(value)) return compactValue(value, seen, options);
  enterObject(value, seen);
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === "projects" || key === "products" || key === "jobs" || isHeavyKey(key, item)) continue;
    const compacted = compactValue(item, seen, options);
    if (compacted !== undefined) result[key] = compacted;
  }
  seen.delete(value);
  return result;
}

function compactValue(value, seen, options) {
  if (typeof value === "string") {
    if (EMBEDDED_ASSET.test(value)) return undefined;
    const limit = Number.isFinite(options.maxTextLength) && options.maxTextLength >= 0
      ? Math.floor(options.maxTextLength)
      : DEFAULT_TEXT_LIMIT;
    return value.length > limit ? `${value.slice(0, limit)}...` : value;
  }
  if (Array.isArray(value)) {
    enterObject(value, seen);
    const result = value.map((item) => compactValue(item, seen, options)).filter((item) => item !== undefined);
    seen.delete(value);
    return result;
  }
  if (isPlainObject(value)) return compactObject(value, seen, options);
  return value;
}

function enterObject(value, seen) {
  if (seen.has(value)) throw new TypeError("State contains a circular reference");
  seen.add(value);
}

function isHeavyKey(key, value) {
  if (String(key).toLowerCase() === "filedata" && typeof value === "string" && !EMBEDDED_ASSET.test(value)) return false;
  return HEAVY_KEY.test(String(key));
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}
