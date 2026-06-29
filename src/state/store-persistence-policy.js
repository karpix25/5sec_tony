export function shouldScheduleRemoteSave(previousState, nextState, patch) {
  if (!patch || !Object.keys(patch).length) return true;
  if (!Array.isArray(patch.jobs) || Object.keys(patch).length !== 1) return true;
  return hasMeaningfulJobPersistenceChange(previousState.jobs || [], nextState.jobs || []);
}

function hasMeaningfulJobPersistenceChange(previousJobs, nextJobs) {
  if (previousJobs.length !== nextJobs.length) return true;
  const previousById = new Map(previousJobs.map((job) => [job.id, job]));
  return nextJobs.some((job) => {
    const previous = previousById.get(job.id);
    if (!previous) return true;
    return hasPersistedJobDelta(previous, job);
  });
}

function hasPersistedJobDelta(previous, next) {
  const fields = [
    "status",
    "stage",
    "serverJobAcceptedAt",
    "imageTaskId",
    "imageProvider",
    "imageUrl",
    "imageData",
    "finalVideoUrl",
    "finalVideoHasAudio",
    "quotaCountedAt",
    "quotaCountedStatus",
    "failMsg",
    "diskStatus",
    "diskPath",
    "diskUrl",
    "diskMessage"
  ];
  return fields.some((field) => (previous[field] || "") !== (next[field] || ""));
}
