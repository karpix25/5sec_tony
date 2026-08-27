export function getVisibleLocalQueueJobs(state, context, paginationState, fallbackFilter = "current") {
  const trackedIds = new Set(paginationState?.localJobIds || []);
  const filter = paginationState?.filter || fallbackFilter;
  return (state.jobs || []).filter((job) => (trackedIds.has(job.id) || isQueueJobActive(job))
    && job.projectId === context.project.id
    && (filter === "all" || job.productId === context.product?.id));
}

function isQueueJobActive(job) {
  if (job?.diskStatus === "uploading") return true;
  if (!["queued", "running"].includes(job?.status)) return false;
  return !["completed", "failed"].includes(job?.queueStatus);
}

export function mergeQueueJobs(remoteJobs, localJobs) {
  const localIds = new Set(localJobs.map((job) => job.id));
  return [...localJobs, ...remoteJobs.filter((job) => !localIds.has(job.id))];
}
