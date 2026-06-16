export function normalizeProjectDailyLimit(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 20;
  return Math.min(500, Math.max(1, Math.round(number)));
}

export function normalizeProjectTotalLimit(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 500;
  return Math.min(10000, Math.max(1, Math.round(number)));
}
