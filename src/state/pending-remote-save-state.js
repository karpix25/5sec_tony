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

export function compactStateForPendingRemoteSave(state) {
  if (!state || typeof state !== "object") return state;
  return {
    ...state,
    jobs: (state.jobs || []).map(compactPendingJob)
  };
}

function compactPendingJob(job) {
  if (!job || typeof job !== "object") return job;
  const compacted = { ...job };
  for (const field of heavyPendingJobFields) {
    if (field in compacted) delete compacted[field];
  }
  return compacted;
}
