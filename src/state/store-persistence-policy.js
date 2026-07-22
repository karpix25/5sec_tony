const localUiStateKeys = new Set([
  "selectedProjectId",
  "selectedProductId",
  "selectedReferenceId",
  "selectedCharacterId",
  "selectedAudioId",
  "selectedProjectTab",
  "queueProductFilter"
]);

export function shouldScheduleRemoteSave(previousState, nextState, patch) {
  const patchKeys = Object.keys(patch || {});
  if (!patchKeys.length) return true;
  if (isLocalUiPatch(patchKeys)) return false;
  if (!Array.isArray(patch.jobs) || patchKeys.length !== 1) return true;
  return hasMeaningfulJobPersistenceChange(previousState.jobs || [], nextState.jobs || []);
}

function isLocalUiPatch(patchKeys) {
  if (patchKeys.every((key) => localUiStateKeys.has(key))) return true;
  const keysWithoutBrief = patchKeys.filter((key) => key !== "generationBrief");
  return patchKeys.includes("generationBrief")
    && keysWithoutBrief.length > 0
    && keysWithoutBrief.every((key) => localUiStateKeys.has(key));
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
    "diskVerifiedAt",
    "diskSize",
    "diskVerification",
    "diskMessage",
    "yandexDiskRequired"
  ];
  return fields.some((field) => (previous[field] || "") !== (next[field] || ""));
}
