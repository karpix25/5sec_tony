const formulaOrder = [
  "red-flag",
  "checklist",
  "mistake",
  "expectation-shift",
  "curiosity",
  "list"
];

const formulaAliases = new Map([
  ["decision-check", "checklist"],
  ["useful-angle", "list"]
]);

const formulaPatterns = [
  ["red-flag", /красн|флаг|опасн|риск/i],
  ["mistake", /ошиб|стоить|лома|не делайте/i],
  ["expectation-shift", /миф|правд|реальн|норма|ожидан/i],
  ["checklist", /проверь|чек|пункт|признак/i],
  ["curiosity", /почему|зачем|что будет/i]
];

export function classifyHeadlineFormula(value) {
  const explicit = normalizeFormulaId(typeof value === "object" ? value?.headlineFormula || value?.formula : "");
  if (explicit) return explicit;

  const source = getHeadlineText(value);
  return formulaPatterns.find(([, pattern]) => pattern.test(source))?.[0] || "list";
}

export function resolveHeadlineFormula({ headline, existingJobs = [], recentFormulas = [], locked = false, maxConsecutive = 2 } = {}) {
  const candidate = classifyHeadlineFormula(headline);
  const history = getRecentHeadlineFormulas({ existingJobs, recentFormulas });
  if (locked || !candidate || countLeadingFormula(history, candidate) < maxConsecutive) {
    return { formula: candidate, changed: false, history };
  }

  const counts = countFormulas(history);
  const formula = formulaOrder
    .filter((item) => item !== candidate)
    .sort((left, right) => (counts.get(left) || 0) - (counts.get(right) || 0)
      || formulaOrder.indexOf(left) - formulaOrder.indexOf(right))[0] || candidate;

  return { formula, changed: formula !== candidate, history };
}

export function getRecentHeadlineFormulas({ existingJobs = [], recentFormulas = [] } = {}) {
  const explicit = recentFormulas
    .map((item) => normalizeFormulaId(item) || classifyHeadlineFormula(item))
    .filter(Boolean);
  if (explicit.length) return explicit;
  return existingJobs.map(classifyHeadlineFormula).filter(Boolean);
}

export function isHeadlineLocked(value = {}) {
  return Boolean(
    value?.headlineLocked
    || value?.lockHeadline
    || value?.lockedHeadline
    || value?.manualHeadline
    || value?.isManualHeadline
    || value?.manual === true
    || value?.generationSource === "manual"
    || value?.source === "manual"
    || value?.diversitySlot?.lockTopic === true
  );
}

export function getExplicitHeadline(value = {}) {
  return String(value.lockedHeadline || value.manualHeadline || value.headline || value.hook || "").trim();
}

function getHeadlineText(value) {
  if (typeof value === "string") return value;
  return [
    value?.headline,
    value?.title,
    value?.finalContent?.headline,
    value?.aiPlan?.headline,
    value?.hook
  ].find((item) => String(item || "").trim()) || "";
}

function normalizeFormulaId(value) {
  const source = String(value || "").trim().toLowerCase().replace(/\s+/g, "-");
  if (formulaOrder.includes(source)) return source;
  return formulaAliases.get(source) || "";
}

function countLeadingFormula(history, candidate) {
  let count = 0;
  for (const formula of history) {
    if (formula !== candidate) break;
    count += 1;
  }
  return count;
}

function countFormulas(history) {
  return history.reduce((counts, formula) => counts.set(formula, (counts.get(formula) || 0) + 1), new Map());
}
