const dayMs = 24 * 60 * 60 * 1000;
const maxAutomaticParallelJobs = 5;
const maxAutomaticBatchSize = 10;

export function getAutomationPacing({
  dailyLimit,
  usedToday,
  activeJobs = 0,
  remainingProject = Infinity,
  now = Date.now()
} = {}) {
  const limit = normalizePositiveInteger(dailyLimit, 20);
  const used = normalizeNonNegativeInteger(usedToday);
  const active = normalizeNonNegativeInteger(activeJobs);
  const projectRemaining = normalizeRemaining(remainingProject);
  const targetStartedToday = getTargetStartedToday(limit, now);
  const scheduledToday = Math.min(limit, used + active);
  const dueCount = Math.max(0, targetStartedToday - scheduledToday);
  const maxParallel = getAutomaticParallelLimit(limit);
  const availableParallel = Math.max(0, maxParallel - active);
  const availableDaily = Math.max(0, limit - used - active);
  const availableProject = Math.max(0, projectRemaining - active);
  const nextCount = Math.min(
    maxAutomaticBatchSize,
    dueCount,
    availableParallel,
    availableDaily,
    availableProject
  );

  return {
    maxParallel,
    targetStartedToday,
    scheduledToday,
    dueCount,
    availableParallel,
    nextCount
  };
}

export function getAutomaticParallelLimit(dailyLimit) {
  const limit = normalizePositiveInteger(dailyLimit, 20);
  return Math.min(maxAutomaticParallelJobs, Math.max(1, Math.ceil(limit / 24)));
}

function getTargetStartedToday(limit, now) {
  const progress = getUtcDayProgress(now);
  return Math.min(limit, Math.ceil(limit * progress));
}

function getUtcDayProgress(now) {
  const time = toValidTime(now);
  const date = new Date(time);
  const start = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.max(0, Math.min(1, (time - start) / dayMs));
}

function normalizePositiveInteger(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.round(number);
}

function normalizeNonNegativeInteger(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return Math.round(number);
}

function normalizeRemaining(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return Infinity;
  return Math.max(0, Math.round(number));
}

function toValidTime(value) {
  const time = value instanceof Date ? value.getTime() : Number(value);
  return Number.isFinite(time) ? time : Date.now();
}
