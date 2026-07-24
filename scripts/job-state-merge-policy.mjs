const activeQueueStatuses = new Set(["queued", "running", "retrying"]);
const terminalStatuses = new Set(["done", "review", "failed"]);

const protectedQueueKeys = [
  "queueName",
  "queueStatus",
  "queuePriority",
  "queueAttempts",
  "queueMaxAttempts",
  "queueScheduledAt",
  "queueLockedAt",
  "queueLockOwner",
  "queueLastError",
  "queueIdempotencyKey",
  "queueProviderTaskId",
  "queueMetadata"
];

const protectedLifecycleKeys = [
  "serverJobAcceptedAt",
  "serverJobContext",
  "serverBatchId",
  "imageTaskId",
  "imageProvider",
  "imageUrl",
  "imageData",
  "finalVideoUrl",
  "finalVideoHasAudio",
  "diskStatus",
  "diskPath",
  "diskUrl",
  "diskMessage",
  "avatarUsage",
  "renderedWithoutAvatar"
];

const protectedRuntimeKeys = ["status", "stage", "progress", "failMsg"];
const protectedGenerationContentKeys = [
  "referenceId",
  "referenceTitle",
  "prompt",
  "promptContract",
  "imagePromptContract",
  "inputUrls",
  "inputRefs",
  "layoutContentPlan",
  "imagePromptPackage",
  "productVisibilityDecision"
];

export function mergeClientJobWithServerJob(clientJob, serverJob) {
  const client = asObject(clientJob);
  const server = asObject(serverJob);
  if (!client.id || !server.id || client.id !== server.id || !isServerProtectedJob(server)) return client;

  const merged = { ...client };
  preserveAuthoritativeKeys(merged, server, [...protectedQueueKeys, ...protectedLifecycleKeys]);
  preserveMeaningfulAuthoritativeKeys(merged, server, protectedGenerationContentKeys);

  if (shouldPreserveServerRuntime(server, client)) {
    preserveAuthoritativeKeys(merged, server, protectedRuntimeKeys);
  }

  return merged;
}

export function isQueueManagedServerJob(job) {
  const source = asObject(job);
  if (activeQueueStatuses.has(String(source.queueStatus || ""))) return true;
  if (isAcceptedBackendJobWithoutProviderTask(source)) return true;
  if (source.queueName !== "generation") return false;
  if (terminalStatuses.has(String(source.status || ""))) return false;
  const status = String(source.status || "");
  if (["running", "retrying"].includes(status)) return true;
  return status === "queued" && hasQueueLifecycleMarker(source);
}

export function isServerProtectedJob(job) {
  return isQueueManagedServerJob(job) || hasMeaningfulLifecycle(job) || isTerminalWithServerOutput(job);
}

function shouldPreserveServerRuntime(server, client) {
  if (isQueueManagedServerJob(server)) return true;
  if (terminalStatuses.has(String(server.status || "")) && !terminalStatuses.has(String(client.status || ""))) return true;
  return hasMeaningfulLifecycle(server) && ["queued", "running", "retrying"].includes(String(server.status || ""));
}

function isTerminalWithServerOutput(job) {
  const source = asObject(job);
  return terminalStatuses.has(String(source.status || "")) && (
    hasMeaningfulValue(source.imageUrl)
    || hasMeaningfulValue(source.finalVideoUrl)
    || hasMeaningfulValue(source.diskPath)
    || hasMeaningfulValue(source.queueLastError)
  );
}

function hasMeaningfulLifecycle(job) {
  return protectedLifecycleKeys.some((key) => hasMeaningfulValue(asObject(job)[key]));
}

function hasQueueLifecycleMarker(job) {
  const source = asObject(job);
  return hasMeaningfulValue(source.serverJobAcceptedAt)
    || hasMeaningfulValue(source.queueIdempotencyKey)
    || hasMeaningfulValue(source.queueProviderTaskId)
    || hasMeaningfulValue(source.queueScheduledAt)
    || hasMeaningfulValue(source.queueLockedAt);
}

function isAcceptedBackendJobWithoutProviderTask(job) {
  const source = asObject(job);
  return source.status === "running"
    && hasMeaningfulValue(source.serverJobAcceptedAt)
    && !hasMeaningfulValue(source.imageTaskId)
    && !hasMeaningfulValue(source.imageUrl);
}

function preserveAuthoritativeKeys(target, source, keys) {
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
    target[key] = source[key];
  }
}

function preserveMeaningfulAuthoritativeKeys(target, source, keys) {
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
    if (!hasMeaningfulValue(source[key])) continue;
    target[key] = source[key];
  }
}

function hasMeaningfulValue(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  if (typeof value === "boolean") return value === true;
  return true;
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
