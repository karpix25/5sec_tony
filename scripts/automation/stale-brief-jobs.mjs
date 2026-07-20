const defaultStaleBriefMs = 45 * 60 * 1000;
const activeStatuses = new Set(["queued", "running"]);
const activeQueueStatuses = new Set(["queued", "running", "retrying"]);

export function rescueStaleBriefJobsInState(state = {}, options = {}) {
  const nowMs = toTime(options.now || new Date());
  const staleMs = Math.max(1, Number(options.staleMs || defaultStaleBriefMs));
  const rescuedJobs = [];
  const jobs = (state.jobs || []).map((job) => {
    if (!isStaleBriefPlaceholder(job, nowMs, staleMs)) return job;
    rescuedJobs.push(job);
    return {
      ...job,
      status: "failed",
      stage: "brief",
      progress: 100,
      queueStatus: job.queueStatus ? "failed" : job.queueStatus,
      failMsg: "Зависшая подготовка AI-брифа остановлена серверным авторежимом. Запустите генерацию заново."
    };
  });
  return { state: rescuedJobs.length ? { ...state, jobs } : state, rescuedJobs };
}

export function isStaleBriefPlaceholder(job = {}, nowMs = Date.now(), staleMs = defaultStaleBriefMs) {
  if (!job.serverBatchId || job.stage !== "brief") return false;
  if (!job.isBriefPlaceholder && !/AI-бриф/i.test(String(job.title || ""))) return false;
  if (!activeStatuses.has(job.status)) return false;
  if (hasActiveQueueStatus(job)) return false;
  const startedMs = getBriefStartedAtMs(job);
  if (!Number.isFinite(startedMs)) return true;
  return nowMs - startedMs >= staleMs;
}

function hasActiveQueueStatus(job) {
  const queueStatus = String(job.queueStatus || "").trim();
  return activeQueueStatuses.has(queueStatus);
}

function getBriefStartedAtMs(job) {
  return firstValidTime([
    job.briefStartedAt,
    job.serverJobAcceptedAt,
    job.queueScheduledAt,
    job.createdAt
  ]);
}

function firstValidTime(values) {
  for (const value of values) {
    const time = toTime(value);
    if (Number.isFinite(time)) return time;
  }
  return NaN;
}

function toTime(value) {
  if (value instanceof Date) return value.getTime();
  if (!value) return NaN;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : NaN;
}
