const vaguePhrases = [
  "регулярность важна",
  "системный подход",
  "простая привычка",
  "забота о себе",
  "поддержка организма",
  "помогает поддержать",
  "важно понимать"
];

const forbiddenVisiblePhrases = [
  "подпишись",
  "подписывайся",
  "купите",
  "закажите",
  "в профиле",
  "в описании",
  "не является лекарством",
  "проконсультируйтесь"
];

const productDamagePhrases = [
  "бесполез",
  "пустыш",
  "обман",
  "не работает",
  "не нужен",
  "опасен",
  "вредит"
];

export function validateCreativeBrief({ draft = {}, project = {}, product = {}, layoutPlan = {}, hookIntelligence = {}, existingJobs = [] }) {
  const text = collectDraftText(draft).toLowerCase();
  const checks = {
    specificity: hasSpecificity(text),
    tension: hasTension(text),
    novelty: hasNovelty(text),
    hookFit: hasHookFit(draft, hookIntelligence),
    layoutFit: hasLayoutFit(draft, layoutPlan),
    productSafe: !productDamagePhrases.some((phrase) => text.includes(phrase)),
    noForbiddenVisible: !forbiddenVisiblePhrases.some((phrase) => text.includes(phrase)),
    noRestrictedClaims: !hasRestrictedClaims(text, project, product),
    freshness: hasFreshness(text, existingJobs)
  };
  const curiosityScore = scoreChecks(checks);
  return {
    curiosityScore,
    checks,
    warnings: buildWarnings(checks, text),
    passed: curiosityScore >= 8 && checks.productSafe && checks.noForbiddenVisible && checks.noRestrictedClaims
  };
}

export function formatCreativeQualityPrompt(report) {
  if (!report) return "";
  return [
    "ВНУТРЕННЯЯ ПРОВЕРКА КАЧЕСТВА: это инструкция редактора, не писать эти слова на изображении.",
    `Curiosity score target: 8/10. Current estimated score: ${report.curiosityScore}/10.`,
    report.warnings.length ? `Rewrite risks: ${report.warnings.join("; ")}.` : "No obvious rewrite risks.",
    "Если нет конкретного факта, микроконфликта или узнаваемой ситуации, перепиши тему до финального текста."
  ].join(" ");
}

function collectDraftText(draft) {
  return [
    draft.topic,
    draft.hook,
    draft.scrollStopperAngle,
    draft.productFact,
    draft.productPositiveBridge,
    draft.layoutStrategy,
    draft.plan?.headline,
    draft.plan?.subhead,
    ...(Array.isArray(draft.plan?.points) ? draft.plan.points : []),
    JSON.stringify(draft.finalContent || draft.layoutContent || {})
  ].filter(Boolean).join(" ");
}

function hasSpecificity(text) {
  return /япони|итал|рим|сингапур|дуба|оаэ|гиалурон|коллаген|хлорофилл|чаев|капучино|эспрессо|влажн|крем|стакан|зел[её]н/.test(text);
}

function hasTension(text) {
  return /ошиб|не так|нелов|смути|выдает|лома|ожид|реальн|миф|вместо|после обеда|сух/.test(text);
}

function hasNovelty(text) {
  if (vaguePhrases.some((phrase) => text.includes(phrase))) return false;
  return /факт|оказалось|неожидан|почему|в японии|в италии|в сингапуре|гиалуроновая кислота|хлорофилл/.test(text);
}

function hasHookFit(draft, hookIntelligence) {
  if (!hookIntelligence?.sourceHook) return true;
  const sourceHook = String(draft.sourceHook || draft.hookReference?.text || "").trim();
  return sourceHook === hookIntelligence.sourceHook || Boolean(draft.hook || draft.adaptedHook);
}

function hasLayoutFit(draft, layoutPlan) {
  if (!layoutPlan?.layoutType) return true;
  const text = collectDraftText(draft).toLowerCase();
  const layout = layoutPlan.layoutType;
  if (layout === "symptoms-poster") return /симптом|признак|выдает|плашк|poster/.test(text);
  if (layout === "beauty-grid") return /ячейк|grid|сетка|компонент|гиалурон|коллаген/.test(text);
  if (layout === "minimal-thesis") return /тезис|минимал|коротк|влажн|сыворот/.test(text);
  if (layout === "nostalgia-story") return /сцен|ритуал|утро|ностальг|vhs|90/.test(text);
  return true;
}

function hasRestrictedClaims(text, project, product) {
  const source = `${project?.restrictions || ""} ${(product?.forbidden || []).join(" ")}`.toLowerCase();
  const wellness = /бад|wellness|нутрицевтик|хлорофилл|хлорофил/.test(`${project?.name || ""} ${product?.name || ""}`.toLowerCase());
  const beauty = /космет|сыворот|гиалурон|коллаген/.test(`${project?.name || ""} ${product?.name || ""}`.toLowerCase());
  if (wellness && /леч|детокс|похуд|кишеч|очищ.*кож|диагноз|гарант/.test(text)) return true;
  if (beauty && /минус\s*\d+|пластик|леч|мгнов|моменталь|гарант/.test(text)) return true;
  return source && source.split(/\n|;|,/).some((item) => item.trim().length > 4 && text.includes(item.trim()));
}

function hasFreshness(text, existingJobs) {
  const recent = existingJobs.slice(0, 8).map((job) => `${job.title || ""} ${job.topic || ""}`.toLowerCase());
  return !recent.some((item) => item && item.length > 12 && text.includes(item.slice(0, 40)));
}

function scoreChecks(checks) {
  return [
    checks.specificity,
    checks.tension,
    checks.novelty,
    checks.hookFit,
    checks.layoutFit,
    checks.productSafe,
    checks.noForbiddenVisible,
    checks.noRestrictedClaims,
    checks.freshness
  ].filter(Boolean).length;
}

function buildWarnings(checks, text) {
  const warnings = [];
  if (!checks.specificity) warnings.push("мало конкретики");
  if (!checks.tension) warnings.push("нет микроконфликта");
  if (!checks.novelty) warnings.push("слишком общая польза вместо факта");
  if (!checks.layoutFit) warnings.push("текст не соответствует дизайн-структуре");
  if (!checks.productSafe) warnings.push("формулировка может порочить продукт");
  if (!checks.noForbiddenVisible) warnings.push("видимый CTA или дисклеймер");
  if (!checks.noRestrictedClaims) warnings.push("есть запрещенный claim");
  if (!checks.freshness) warnings.push("похоже на последние генерации");
  if (/\bn\b|\([^)]*\)/i.test(text)) warnings.push("остались шаблонные плейсхолдеры");
  return warnings;
}
