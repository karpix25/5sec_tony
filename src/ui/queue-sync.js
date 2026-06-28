import { loadRemoteState } from "../services/state-sync.js";
import { syncRunningImageJobs } from "./job-runner.js";

const queueSyncTerminalStatuses = new Set(["done", "review", "failed"]);
const queueSyncActiveStatuses = new Set(["queued", "running"]);

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
    if (patch && !Array.isArray(patch.jobs)) return;
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

export async function refreshQueueFromRemoteState(store) {
  if (typeof store.mergeServerJobs !== "function") return [];
  const localActiveJobs = getActiveQueueJobs(store);
  if (!localActiveJobs.length) return [];
  const localIds = new Set(localActiveJobs.map((job) => job.id));
  const remote = await loadRemoteState();
  const remoteJobs = Array.isArray(remote.state?.jobs) ? remote.state.jobs : [];
  const updates = remoteJobs.filter((job) => localIds.has(job?.id) && shouldApplyRemoteJob(job));
  return store.mergeServerJobs(updates);
}

function hasActiveQueueJobs(store) {
  return getActiveQueueJobs(store).length > 0;
}

function getActiveQueueJobs(store) {
  const jobs = store.getState?.().jobs || [];
  return jobs.filter((job) => queueSyncActiveStatuses.has(job?.status));
}

function shouldApplyRemoteJob(job) {
  if (queueSyncTerminalStatuses.has(job?.status)) return true;
  return Boolean(job?.imageUrl || job?.imageData || job?.finalVideoUrl || job?.serverJobAcceptedAt || job?.imageTaskId);
}
