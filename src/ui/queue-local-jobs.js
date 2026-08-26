export function getTrackedLocalQueueJobs(state, context, paginationState, fallbackFilter = "current") {
  const trackedIds = new Set(paginationState?.localJobIds || []);
  if (!trackedIds.size) return [];
  const filter = paginationState.filter || fallbackFilter;
  return (state.jobs || []).filter((job) => trackedIds.has(job.id)
    && job.projectId === context.project.id
    && (filter === "all" || job.productId === context.product?.id));
}

export function mergeQueueJobs(remoteJobs, localJobs) {
  const localIds = new Set(localJobs.map((job) => job.id));
  return [...localJobs, ...remoteJobs.filter((job) => !localIds.has(job.id))];
}
