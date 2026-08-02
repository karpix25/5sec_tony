const dayMs = 24 * 60 * 60 * 1000;
const maxAutomaticParallelJobs = 5;
const maxAutomaticBatchSize = 10;

export function getAutomationPacing({
  dailyLimit,
  usedToday,
  activeJobs = 0,
  remainingProject = Infinity,
  batchSize,
  concurrency,
  timeZone = "America/Argentina/Buenos_Aires",
  now = Date.now()
} = {}) {
  const limit = normalizePositiveInteger(dailyLimit, 20);
  const used = normalizeNonNegativeInteger(usedToday);
  const active = normalizeNonNegativeInteger(activeJobs);
  const projectRemaining = normalizeRemaining(remainingProject);
  const batch = normalizePositiveInteger(batchSize, maxAutomaticBatchSize);
  const targetStartedToday = getTargetStartedToday(limit, now, timeZone);
  const scheduledToday = Math.min(limit, used + active);
  const dueCount = Math.max(0, targetStartedToday - scheduledToday);
  const maxParallel = getAutomaticParallelLimit(limit, concurrency);
  const availableParallel = Math.max(0, maxParallel - active);
  const availableDaily = Math.max(0, limit - used - active);
  const availableProject = Math.max(0, projectRemaining - active);
  const nextCount = Math.min(
    batch,
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

export function getAutomaticParallelLimit(dailyLimit, concurrency) {
  const configured = Number(concurrency);
  if (Number.isFinite(configured)) return Math.min(maxAutomaticParallelJobs, Math.max(1, Math.round(configured)));
  const limit = normalizePositiveInteger(dailyLimit, 20);
  return Math.min(maxAutomaticParallelJobs, Math.max(1, Math.ceil(limit / 24)));
}

function getTargetStartedToday(limit, now, timeZone) {
  const progress = getDayProgress(now, timeZone);
  return Math.min(limit, Math.ceil(limit * progress));
}

function getDayProgress(now, timeZone) {
  const time = toValidTime(now);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date(time));
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, Number(value)]));
  const elapsedMs = (values.hour * 3600 + values.minute * 60 + values.second) * 1000;
  return Math.max(0, Math.min(1, elapsedMs / dayMs));
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
