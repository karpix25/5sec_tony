const oldCountPattern = /(^|\s)[3-7]\s*(маркер|признак|пункт|симптом|ошиб|вещ|привыч|сигнал)/i;
const topHeadlinePattern = /^(top|топ)(\s|\d|$)/i;
const rankingFillers = [
  "Режим",
  "Вода",
  "Сон",
  "Фокус",
  "Завтрак",
  "Свет",
  "Экран",
  "Движение",
  "Ритуал",
  "Пауза",
  "Вкус",
  "Комфорт"
];

export function getDesignTextContractViolations({ contentScript = {}, designFormatBrief = {} } = {}) {
  if (designFormatBrief.formatType !== "ranking_leaderboard") return [];
  const expectedCount = getRankingItemCount(designFormatBrief);
  const points = getScriptPoints(contentScript);
  const violations = [];
  const headline = String(contentScript.headline || "");
  if (!topHeadlinePattern.test(headline) || hasWeakTopHeadline(headline)) violations.push("headline_not_top_chart");
  if (oldCountPattern.test(String(contentScript.headline || ""))) violations.push("headline_old_count");
  if (oldCountPattern.test(String(contentScript.subhead || ""))) violations.push("subhead_old_count");
  if (points.length < Math.min(8, expectedCount)) violations.push("not_enough_rank_items");
  if (points.some((point) => normalizePointText(point).split(/\s+/).filter(Boolean).length > 7)) violations.push("rank_item_too_long");
  return violations;
}

export function normalizeContentScriptForDesignContract({ contentScript = {}, designFormatBrief = {} } = {}) {
  if (designFormatBrief.formatType !== "ranking_leaderboard") return contentScript;
  const expectedCount = getRankingItemCount(designFormatBrief);
  const rawPoints = getScriptPoints(contentScript).map(normalizePointText).filter(Boolean);
  const points = rawPoints.slice(0, expectedCount).map(shortenRankLabel);
  for (const filler of rankingFillers) {
    if (points.length >= expectedCount) break;
    if (!hasSimilarPoint(points, filler)) points.push(filler);
  }
  while (points.length < expectedCount) points.push(`Критерий ${points.length + 1}`);
  return {
    ...contentScript,
    headline: normalizeRankingHeadline(contentScript.headline, expectedCount),
    subhead: normalizeRankingSubhead(contentScript.subhead),
    points: points.map((point, index) => `${index + 1}: ${point}`)
  };
}

export function hasDesignTextContractViolations(payload = {}) {
  return getDesignTextContractViolations(payload).length > 0;
}

function getScriptPoints(contentScript) {
  return Array.isArray(contentScript?.points) ? contentScript.points.filter(Boolean) : [];
}

function getRankingItemCount(designFormatBrief) {
  const contract = designFormatBrief.textContract || {};
  const preferred = Number(contract.preferredItems || contract.maxItems || contract.minItems || 10);
  return Math.max(8, Math.min(12, Number.isFinite(preferred) ? preferred : 10));
}

function normalizeRankingHeadline(headline, count) {
  const clean = String(headline || "").replace(oldCountPattern, "").replace(/\s+/g, " ").trim();
  if (topHeadlinePattern.test(clean)) return normalizeExistingTopHeadline(clean, count);
  const topic = clean.replace(/[?!:.]+$/g, "").split(/\s+/).slice(0, 3).join(" ");
  return topic ? `ТОП ${count}: ${topic}` : `ТОП ${count} признаков`;
}

function normalizeExistingTopHeadline(value, count) {
  const clean = value.replace(/\b[3-9]\b|\b1[0-2]\b/g, String(count)).replace(/\s+/g, " ").trim();
  const words = clean.split(/\s+/).filter(Boolean);
  const hasRepeatedCount = (clean.match(new RegExp(`\\b${count}\\b`, "g")) || []).length > 1;
  const endsWithConnector = /(что|как|почему|если|когда)$/i.test(clean);
  if (hasRepeatedCount || endsWithConnector || words.length > 5) return `ТОП ${count} сигналов`;
  return clean.replace(/^top/i, "ТОП");
}

function hasWeakTopHeadline(value) {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  const numbers = clean.match(/\b(?:[3-9]|1[0-2])\b/g) || [];
  return numbers.length > 1 || /(что|как|почему|если|когда)$/i.test(clean) || clean.split(/\s+/).length > 6;
}

function normalizeRankingSubhead(subhead) {
  const clean = String(subhead || "").replace(oldCountPattern, "").replace(/\s+/g, " ").trim();
  if (!clean || clean.length < 8) return "Маркеры дня | проверь привычки";
  return clean.replace(/^[,:\-\s]+|[,:\-\s]+$/g, "") || "Маркеры дня | проверь привычки";
}

function normalizePointText(point) {
  const value = point && typeof point === "object"
    ? [point.title, point.label, point.text, point.caption].filter(Boolean).join(" ")
    : String(point || "");
  return value
    .replace(/^\s*\d+[\).:\-]?\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function shortenRankLabel(value) {
  return String(value || "")
    .replace(/[.!?]+$/g, "")
    .split(/\s+/)
    .slice(0, 5)
    .join(" ");
}

function hasSimilarPoint(points, value) {
  const needle = value.toLowerCase();
  return points.some((point) => point.toLowerCase().includes(needle));
}
