const defaultRetentionMs = 10 * 60 * 1000;
const preservedReservationStatuses = new Set(["requested", "failed"]);

export function mergePendingGenerationReservations(remoteState = {}, localState = {}, options = {}) {
  const remoteJobs = Array.isArray(remoteState.jobs) ? remoteState.jobs : [];
  const localJobs = Array.isArray(localState.jobs) ? localState.jobs : [];
  const remoteIds = new Set(remoteJobs.map((job) => job?.id).filter(Boolean));
  const pendingJobs = localJobs.filter((job) => shouldPreservePendingReservation(job, remoteIds, options));
  if (!pendingJobs.length) return { state: remoteState, preservedCount: 0 };
  return {
    state: {
      ...remoteState,
      jobs: [...pendingJobs, ...remoteJobs]
    },
    preservedCount: pendingJobs.length
  };
}

function shouldPreservePendingReservation(job, remoteIds, options) {
  if (!job?.id || remoteIds.has(job.id)) return false;
  if (!job.serverOwned || !job.isBriefPlaceholder) return false;
  if (!preservedReservationStatuses.has(job.serverReservationStatus)) return false;
  return isFreshReservation(job, options);
}

function isFreshReservation(job, { now = Date.now(), retentionMs = defaultRetentionMs } = {}) {
  const createdAt = Date.parse(job.briefStartedAt || job.createdAt || "");
  if (!Number.isFinite(createdAt)) return true;
  return now - createdAt <= retentionMs;
}
