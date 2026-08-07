import { getServerImageJobStatus } from "../services/server-jobs.js";
import { syncRunningImageJobs } from "./job-runner.js";

const queueSyncTerminalStatuses = new Set(["done", "review", "failed"]);
const queueSyncTerminalQueueStatuses = new Set(["completed", "failed"]);
const queueSyncActiveStatuses = new Set(["queued", "running"]);
const queueSyncStatusTimeoutMs = 5000;

export function startQueueStatusSync(store, options = {}) {
  const intervalMs = Number(options.intervalMs || 5000);
  const stateIntervalMs = Number(options.stateIntervalMs || 15000);
  let stopped = false;
  let timer = 0;
  let syncing = false;
  let lastStateSyncAt = 0;

  const schedule = (delay = intervalMs) => {
    if (stopped || timer) return;
    timer = setTimeout(run, Math.max(0, delay));
  };

  const run = async () => {
    timer = 0;
    if (stopped || syncing) return schedule(intervalMs);
    syncing = true;
    try {
      await syncRunningImageJobs(store);
      const shouldRefreshState = Date.now() - lastStateSyncAt >= stateIntervalMs;
      if (shouldRefreshState) {
        lastStateSyncAt = Date.now();
        await refreshQueueFromRemoteState(store);
      }
    } catch {
      // Keep the UI sync loop alive; per-job errors are handled by job-runner.
    } finally {
      syncing = false;
      if (hasActiveQueueJobs(store)) schedule(intervalMs);
    }
  };

  const unsubscribe = store.subscribe?.((state, patch) => {
    if (patch && !Array.isArray(patch.jobs) && !Object.hasOwn(patch, "selectedProjectId")) return;
    if (hasActiveQueueJobs({ getState: () => state })) schedule(300);
  });

  const browserWindow = globalThis.window;
  const browserDocument = globalThis.document;
  const refreshOnFocus = () => schedule(0);
  const refreshOnVisibility = () => {
    if (!browserDocument?.hidden) schedule(0);
  };

  browserWindow?.addEventListener?.("focus", refreshOnFocus);
  browserDocument?.addEventListener?.("visibilitychange", refreshOnVisibility);

  Promise.resolve(store.whenHydrated?.())
    .catch(() => null)
    .finally(() => {
      if (hasActiveQueueJobs(store)) schedule(0);
    });

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    unsubscribe?.();
    browserWindow?.removeEventListener?.("focus", refreshOnFocus);
    browserDocument?.removeEventListener?.("visibilitychange", refreshOnVisibility);
  };
}

export async function refreshQueueFromRemoteState(store, options = {}) {
  if (typeof store.mergeServerJobs !== "function") return [];
  const localActiveJobs = getActiveQueueJobs(store);
  if (!localActiveJobs.length) return [];
  const timeoutMs = Number(options.timeoutMs || queueSyncStatusTimeoutMs);
  const results = await Promise.allSettled(localActiveJobs.map((job) => getJobStatusWithTimeout(job.id, timeoutMs)));
  const currentJobsById = new Map(getActiveQueueJobs(store).map((job) => [job.id, job]));
  const remoteJobs = results
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value?.job)
    .filter(Boolean);
  const updates = remoteJobs.filter((job) => shouldApplyRemoteJob(job, currentJobsById.get(job?.id)));
  return store.mergeServerJobs(updates);
}

function hasActiveQueueJobs(store) {
  return getActiveQueueJobs(store).length > 0;
}

function getActiveQueueJobs(store) {
  const state = store.getState?.() || {};
  const selectedProjectId = state.selectedProjectId || "";
  return (state.jobs || []).filter((job) => (!selectedProjectId || job?.projectId === selectedProjectId) && (
    job?.diskStatus === "uploading" || (
      queueSyncActiveStatuses.has(job?.status) && !queueSyncTerminalQueueStatuses.has(job?.queueStatus)
    )
  ));
}

function shouldApplyRemoteJob(job, currentJob) {
  if (!currentJob) return false;
  if (currentJob.diskStatus !== "uploading" && queueSyncTerminalStatuses.has(currentJob.status) && !queueSyncTerminalStatuses.has(job?.status)) return false;
  if (queueSyncTerminalStatuses.has(job?.status)) return true;
  return Boolean(job?.imageUrl || job?.imageData || job?.finalVideoUrl || job?.serverJobAcceptedAt || job?.imageTaskId);
}

function getJobStatusWithTimeout(jobId, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return getServerImageJobStatus(jobId, { signal: controller.signal }).finally(() => clearTimeout(timer));
}
