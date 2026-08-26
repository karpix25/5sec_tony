import { compactStateForLocalCache } from "./local-cache-state.js";

const heavyPendingJobFields = [
  "prompt",
  "promptContract",
  "imagePromptContract",
  "aiTrace",
  "imagePromptPackage",
  "creativeBrief",
  "contentScript",
  "visualBrief",
  "qaReview"
];

const pendingReservationStatuses = new Set(["requested", "failed"]);

export function prepareStateForRemoteSave(state, changedKeys = []) {
  const jobsChanged = Array.isArray(changedKeys) && changedKeys.includes("jobs");
  const compacted = compactStateForLocalCache(state);
  if (jobsChanged) {
    return {
      state: {
        ...compacted,
        jobs: Array.isArray(state?.jobs) ? state.jobs : []
      },
      preserveJobs: false
    };
  }

  const pendingJobs = (state?.jobs || []).filter(isPendingReservation);
  return {
    state: {
      ...compacted,
      jobs: pendingJobs
    },
    preserveJobs: true
  };
}

export function compactStateForPendingRemoteSave(state) {
  if (!state || typeof state !== "object") return state;
  return {
    ...state,
    jobs: (state.jobs || []).map(compactPendingJob)
  };
}

function isPendingReservation(job) {
  return Boolean(job?.id)
    && job.isBriefPlaceholder === true
    && (job.status === "failed"
      || (job.serverOwned === true && pendingReservationStatuses.has(job.serverReservationStatus)));
}

function compactPendingJob(job) {
  if (!job || typeof job !== "object") return job;
  const compacted = { ...job };
  for (const field of heavyPendingJobFields) {
    if (field in compacted) delete compacted[field];
  }
  return compacted;
}
