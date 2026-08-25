const oldCountPattern = /(^|\s)[3-7]\s*(маркер|признак|пункт|симптом|ошиб|вещ|привыч|сигнал)/i;
const topHeadlinePattern = /^(top|топ)(\s|\d|$)/i;
const incompleteHeadlineEndingPattern = /^(а|и|но|если|когда|который|которая|которые|которое|потому|что|как|почему|это|плохой|плохая|плохое)$/i;
const forbiddenVisiblePattern = /подпишись|подписывайся|купите|закажите|в\s+(?:профиле|описании)|не\s+является\s+лекар|проконсультируйтесь|дисклеймер/i;
const numberedHeadlineFragmentPattern = /(?:^|\s)\d{1,2}\s*[.)](?=\s|$)|^заблуждени[ея]\s+про\s+\d/i;
const weakHeadlineShellPattern = /^(?:вот\s+что|разбираемся|миф(?:ы)?\s+(?:о|про)|что\s+важно\s+знать|важн(?:ый|ые)\s+факт|полезн(?:ый|ые)\s+(?:совет|факт))/i;

export function getVisibleTextContractViolations({ contentScript = {} } = {}) {
  const headline = normalizeVisibleLine(contentScript.headline);
  const subhead = normalizeVisibleLine(contentScript.subhead);
  const points = getScriptPoints(contentScript).map(normalizeVisibleLine).filter(Boolean);
  const violations = [];
  const headlineWords = headline.split(/\s+/).filter(Boolean);

  if (!headline) violations.push("headline_empty");
  if (headline.length > 34) violations.push("headline_too_long");
  if (headlineWords.length < 3) violations.push("headline_too_few_words");
  if (headlineWords.length > 6) violations.push("headline_too_many_words");
  if (looksLikeProductDump(headline)) violations.push("headline_product_dump");
  if (numberedHeadlineFragmentPattern.test(headline)) violations.push("headline_numbered_fragment");
  if (weakHeadlineShellPattern.test(headline)) violations.push("headline_weak_shell");
  if (hasAdjacentDuplicateWords(headline)) violations.push("headline_duplicate_word");
  if (incompleteHeadlineEndingPattern.test(lastHeadlineWord(headline))) violations.push("headline_incomplete");
  if (subhead && hasSameMeaning(headline, subhead)) violations.push("subhead_duplicates_headline");
  if ([headline, subhead, ...points].some((line) => /\uFFFD/.test(line))) violations.push("replacement_character");
  if ([headline, subhead, ...points].some((line) => forbiddenVisiblePattern.test(line))) violations.push("forbidden_visible_copy");
  return violations;
}

export function repairVisibleTextContract(contentScript = {}, options = {}) {
  const sourceHeadline = normalizeRepairLine(contentScript.headline);
  const fallbackHeadlines = Array.isArray(options.fallbackHeadlines) ? options.fallbackHeadlines : [];
  const [sourceCandidate, ...sourceClauses] = createHeadlineCandidates(sourceHeadline);
  const candidates = [
    sourceCandidate,
    ...fallbackHeadlines.flatMap(createHeadlineCandidates),
    ...sourceClauses,
    ...[contentScript.subhead, ...getScriptPoints(contentScript)].flatMap(createHeadlineCandidates)
  ]
    .filter((line) => line && !looksLikeProductDump(line) && !forbiddenVisiblePattern.test(line));
  const headline = candidates.find(isValidHeadline)
    || "Эту деталь легко упустить";
  const points = getScriptPoints(contentScript)
    .map(normalizePointText)
    .map(normalizeRepairLine)
    .filter((line) => line && !forbiddenVisiblePattern.test(line));
  const rawSubhead = normalizeRepairLine(contentScript.subhead);
  const subhead = rawSubhead && !looksLikeProductDump(rawSubhead) && !forbiddenVisiblePattern.test(rawSubhead) && !hasSameMeaning(headline, rawSubhead)
    ? rawSubhead
    : points.find((point) => !hasSameMeaning(headline, point)) || "";
  return { ...contentScript, headline, subhead, points };
}

export function assertGenerationTextContract(contentScript = {}, enabled = true) {
  if (!enabled) return;
  const violations = getVisibleTextContractViolations({ contentScript });
  if (violations.length) {
    throw new Error(`Финальный текст AI-брифа не прошел проверку: ${violations.join(", ")}`);
  }
}

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
  void designFormatBrief;
  return contentScript;
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

function hasWeakTopHeadline(value) {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  const numbers = clean.match(/\b(?:[3-9]|1[0-2])\b/g) || [];
  return numbers.length > 1 || /(что|как|почему|если|когда)$/i.test(clean) || clean.split(/\s+/).length > 6;
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

function normalizeVisibleLine(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeRepairLine(value) {
  return normalizeVisibleLine(value)
    .replace(/\uFFFD/g, "")
    .replace(/^[3-7]\s*(?:маркер\w*|признак\w*|пункт\w*|симптом\w*|ошиб\w*|вещ\w*|привыч\w*|сигнал\w*)\s*,?\s*(?:что\s+про|которые|что|про)?\s*/i, "")
    .replace(/^[\s:—–-]+|[.!?\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isValidHeadline(value) {
  return !getVisibleTextContractViolations({ contentScript: { headline: value } }).length;
}

function createHeadlineCandidates(value) {
  const headline = normalizeRepairLine(value);
  if (!headline || numberedHeadlineFragmentPattern.test(headline)) return [headline];
  const clauses = normalizeVisibleLine(value)
    .split(/\s*(?:[.!?;]|:\s+|[—–]\s+)\s*/)
    .map(normalizeRepairLine)
    .filter(Boolean);
  return [...new Set([headline, ...clauses])];
}

function looksLikeProductDump(value) {
  const words = normalizeVisibleLine(value).split(/\s+/).filter(Boolean);
  return value.length > 90 || (words.length > 10 && (value.match(/[.!?](?:\s|$)/g) || []).length > 1);
}

function normalizeVisibleWord(value) {
  return String(value || "").toLowerCase().replace(/[^а-яa-z0-9ё-]/gi, "");
}

function hasAdjacentDuplicateWords(value) {
  const words = normalizeVisibleLine(value).split(/\s+/).filter(Boolean);
  return words.some((word, index) => index > 0 && normalizeVisibleWord(word) === normalizeVisibleWord(words[index - 1]));
}

function lastHeadlineWord(value) {
  return normalizeVisibleWord(normalizeVisibleLine(value).split(/\s+/).at(-1));
}

function normalizeVisibleMeaningKey(value) {
  return normalizeVisibleLine(value)
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^а-яa-z0-9]+/g, " ")
    .split(" ")
    .filter((word) => word.length > 2)
    .join(" ");
}

function hasSameMeaning(left, right) {
  const normalizedLeft = normalizeVisibleMeaningKey(left);
  const normalizedRight = normalizeVisibleMeaningKey(right);
  return Boolean(normalizedLeft && normalizedRight && (normalizedLeft === normalizedRight || normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)));
}
