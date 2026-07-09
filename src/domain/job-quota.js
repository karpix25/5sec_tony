import { createDailyUsageDate, normalizeProjectDailyUsage } from "./daily-usage.js";

const activeQuotaStatuses = ["queued", "running"];

export function patchJobWithQuotaAccounting(state, jobId, payload, createTimestamp = createIsoTimestamp) {
  let quotaProjectId = "";
  const jobs = state.jobs.map((job) => {
    if (job.id !== jobId) return job;
    const nextJob = { ...job, ...payload };
    if (shouldAccountJobQuota(job, nextJob)) {
      quotaProjectId = nextJob.projectId;
      return {
        ...nextJob,
        quotaCountedAt: createTimestamp(),
        quotaCountedStatus: nextJob.status
      };
    }
    return nextJob;
  });

  if (!quotaProjectId) return { jobs };
  return {
    jobs,
    projects: state.projects.map((project) =>
      project.id === quotaProjectId
        ? incrementProjectUsage(project)
        : project
    )
  };
}

export function countSuccessfulGenerationJobs(jobs = []) {
  return jobs.filter((job) => job.quotaCountedAt || isSuccessfulGenerationJob(job)).length;
}

export function countActiveQuotaReservations(jobs = []) {
  return jobs.filter((job) => !job.quotaCountedAt && activeQuotaStatuses.includes(job.status)).length;
}

function incrementProjectUsage(project) {
  const normalized = normalizeProjectDailyUsage(project);
  return {
    ...normalized,
    usedToday: Number(normalized.usedToday || 0) + 1,
    usedTotal: Number(normalized.usedTotal || 0) + 1,
    dailyUsageDate: normalized.dailyUsageDate || createDailyUsageDate()
  };
}

function shouldAccountJobQuota(previousJob, nextJob) {
  if (previousJob?.quotaCountedAt || nextJob?.quotaCountedAt) return false;
  return isSuccessfulGenerationJob(nextJob);
}

function isSuccessfulGenerationJob(job) {
  if (!job || job.status === "failed") return false;
  if (isImageOnlyJob(job)) {
    return ["review", "done"].includes(job.status) && Boolean(job.imageData || job.imageUrl);
  }
  return job.status === "done" && Boolean(job.finalVideoUrl);
}

function isImageOnlyJob(job) {
  return job.outputType === "image" || job.requiresFinalVideo === false;
}

function createIsoTimestamp() {
  return new Date().toISOString();
}
