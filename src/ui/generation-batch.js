export async function runQueuedGenerationBatch({ pendingJobs, prepare, completePendingJob, failPendingJob, runJob }) {
  const completedJobs = [];
  const count = pendingJobs.length;
  for (let index = 0; index < count; index += 1) {
    const pendingJob = pendingJobs[index];
    try {
      await prepare({ index, count, batchJobs: completedJobs });
      const job = completePendingJob(pendingJob.id);
      if (!job) continue;
      completedJobs.push(job);
      runJob(job);
    } catch (error) {
      failPendingJob(pendingJob.id, error);
    }
  }
  return completedJobs;
}
