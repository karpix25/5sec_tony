export function createDailyUsageDate(now = new Date()) {
  const date = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

export function normalizeProjectDailyUsage(project = {}, options = {}) {
  const today = options.today || createDailyUsageDate(options.now);
  const currentDate = String(project.dailyUsageDate || "").slice(0, 10);
  if (!currentDate) return { ...project, dailyUsageDate: today };
  if (currentDate === today) return { ...project, dailyUsageDate: currentDate };
  return { ...project, usedToday: 0, dailyUsageDate: today };
}

export function normalizeStateDailyUsage(state = {}, options = {}) {
  const today = options.today || createDailyUsageDate(options.now);
  return {
    ...state,
    projects: (state.projects || []).map((project) => normalizeProjectDailyUsage(project, { today }))
  };
}

export function getDailyUsageInfo(project = {}, options = {}) {
  const normalized = normalizeProjectDailyUsage(project, options);
  const limit = normalizePositiveNumber(normalized.dailyLimit, 20);
  const used = normalizeUsageNumber(normalized.usedToday);
  const remaining = Math.max(0, limit - used);
  return {
    date: normalized.dailyUsageDate,
    limit,
    used,
    remaining,
    isExhausted: remaining === 0
  };
}

function normalizePositiveNumber(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(1, Math.round(number));
}

function normalizeUsageNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.round(number));
}
