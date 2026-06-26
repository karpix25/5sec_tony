const briefRescueTimeoutMs = 15 * 60 * 1000;

export function createBriefJobStartedAt(now = Date.now()) {
  return new Date(now).toISOString();
}

export function rescueStaleBriefJobs(jobs = [], now = Date.now()) {
  let changed = false;
  const rescuedJobs = jobs.map((job) => {
    if (!isRescuableBriefJob(job, now)) return job;
    changed = true;
    return {
      ...job,
      status: "failed",
      stage: "brief",
      progress: 100,
      failMsg: "AI-бриф не завершился: вкладка была закрыта или процесс прервался. Запустите генерацию заново."
    };
  });
  return changed ? rescuedJobs : jobs;
}

function isRescuableBriefJob(job, now) {
  if (!job || job.status !== "running" || job.stage !== "brief" || !job.isBriefPlaceholder) return false;
  if (hasServerHandshake(job)) return false;
  const startedAt = Date.parse(job.briefStartedAt || "");
  if (!Number.isFinite(startedAt)) return true;
  return now - startedAt > briefRescueTimeoutMs;
}

function hasServerHandshake(job) {
  return Boolean(job.serverJobAcceptedAt || job.imageTaskId || job.imageProvider || job.finalVideoUrl || job.imageUrl);
}
