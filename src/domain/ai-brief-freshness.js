const freshnessStopWords = new Set([
  "а", "без", "бы", "в", "вам", "ваш", "ваша", "ваше", "ваши", "все", "для",
  "до", "его", "ее", "если", "есть", "за", "и", "из", "или", "как", "когда",
  "на", "не", "но", "о", "об", "от", "по", "под", "при", "про", "с", "со",
  "так", "то", "у", "уже", "что", "это", "этот", "эта", "эти", "вашего",
  "вашей", "который", "которые", "почему", "нужно", "нужна", "тема",
  "темы", "тему", "темой", "хук", "идея"
]);

const overusedFormulaPatterns = [
  /волшебн[\p{L}\p{N}_]*\s+таблетк[\p{L}\p{N}_]*/iu,
  /скрыт[\p{L}\p{N}_]*\s+ошибк[\p{L}\p{N}_]*/iu,
  /миф\s+о/iu,
  /\d+\s+сигнал[\p{L}\p{N}_]*,?\s+что/iu
];

export function assessAiBriefFreshness(brief, existingJobs = []) {
  const candidateText = collectBriefText(brief).join(" ");
  const candidate = normalizeFreshnessText(candidateText);
  if (!candidate) return { ok: true, reasons: [] };

  const reasons = [];
  const formula = findOverusedFormula(candidateText);
  if (formula) reasons.push(`слишком шаблонная формула: ${formula}`);

  const repeatedOpening = findRepeatedHeadlineOpening(getBriefTitle(brief), existingJobs);
  if (repeatedOpening) reasons.push(`повторяет начало недавнего заголовка: ${repeatedOpening}`);

  const duplicate = findDuplicateTopic(candidate, existingJobs);
  if (duplicate) reasons.push(`повторяет недавнюю тему: ${duplicate.title || duplicate.topic}`);

  return {
    ok: reasons.length === 0,
    reasons,
    candidateTitle: getBriefTitle(brief),
    candidateTopic: getBriefTopic(brief)
  };
}

export function createRejectedBriefJob(brief, freshness) {
  const title = freshness.candidateTitle || getBriefTitle(brief) || "Отклоненная тема";
  const topic = freshness.candidateTopic || getBriefTopic(brief) || title;
  return {
    id: `rejected-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title: `ОТКЛОНЕНО: ${title}`,
    topic: `${topic}. Причина: ${(freshness.reasons || []).join("; ")}`,
    semanticKey: brief.semanticKey || brief.diversitySlot?.id || "",
    contentLayerId: brief.contentLayerId || brief.diversitySlot?.contentLayer?.id || "",
    diversitySlot: brief.diversitySlot || null,
    topicCluster: brief.topicCluster || null,
    hookIntelligence: { hookType: "rejected-duplicate" }
  };
}

export function createFreshnessFallbackBrief(brief, rejectedJobs = []) {
  return {
    ...brief,
    qualityWarnings: [
      ...(brief.qualityWarnings || []),
      "AI-бриф принят после freshness retry, чтобы не блокировать генерацию."
    ],
    freshnessOverride: {
      acceptedAfterRetries: true,
      rejectedAttempts: rejectedJobs.length,
      reasons: rejectedJobs
        .map((job) => String(job.topic || ""))
        .filter(Boolean)
        .slice(-3)
    }
  };
}

function findOverusedFormula(text) {
  return overusedFormulaPatterns.find((pattern) => pattern.test(text))?.source || "";
}

function findRepeatedHeadlineOpening(headline, existingJobs) {
  const opening = getHeadlineOpening(headline);
  if (!opening) return "";
  const match = (existingJobs || []).slice(0, 8).find((job) => getHeadlineOpening(getJobTitle(job)) === opening);
  return match ? opening : "";
}

function getHeadlineOpening(value) {
  const words = normalizeFreshnessText(value).split(" ").filter(Boolean);
  return words[0] === "почему" ? "почему" : words.slice(0, 2).join(" ");
}

function getJobTitle(job = {}) {
  return job.title || job.finalContent?.headline || job.aiPlan?.headline || job.hook || "";
}

function findDuplicateTopic(candidate, existingJobs) {
  const candidateTokens = tokenizeFreshnessText(candidate);
  const candidateBigrams = createBigrams(candidateTokens);
  if (!candidateTokens.length) return null;

  return (existingJobs || []).find((job) => {
    const text = normalizeFreshnessText(collectJobText(job).join(" "));
    if (!text) return false;
    const jobTokens = tokenizeFreshnessText(text);
    const overlap = countTokenOverlap(candidateTokens, jobTokens);
    const similarity = overlap / Math.max(1, Math.min(candidateTokens.length, jobTokens.length));
    const sharedBigram = createBigrams(jobTokens).some((bigram) => candidateBigrams.includes(bigram));
    return similarity >= 0.44 || (sharedBigram && overlap >= 2) || overlap >= 5;
  }) || null;
}

function collectBriefText(brief = {}) {
  const texts = [
    brief.title,
    brief.topic,
    brief.hook,
    brief.recommendedHook,
    brief.sourceHook,
    brief.scrollStopperAngle,
    getBriefTopic(brief),
    getBriefTitle(brief)
  ];
  collectObjectText(brief.creativeBrief, texts);
  collectObjectText(brief.contentScript || brief.plan || brief.aiPlan, texts);
  collectObjectText(brief.finalContent, texts);
  collectObjectText(brief.hookIntelligence, texts);
  collectObjectText(brief.productFact, texts);
  return texts.filter(Boolean);
}

function collectJobText(job = {}) {
  const texts = [job.title, job.topic, job.hook, job.sourceHook, job.semanticKey];
  collectObjectText(job.finalContent, texts);
  collectObjectText(job.aiPlan, texts);
  collectObjectText(job.hookIntelligence, texts);
  return texts.filter(Boolean);
}

function collectObjectText(value, texts) {
  if (!value) return;
  if (typeof value === "string") {
    texts.push(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectObjectText(item, texts));
    return;
  }
  if (typeof value === "object") {
    Object.values(value).forEach((item) => collectObjectText(item, texts));
  }
}

function getBriefTitle(brief = {}) {
  return brief.title || brief.headline || brief.aiPlan?.headline || brief.plan?.headline || brief.finalContent?.headline || "";
}

function getBriefTopic(brief = {}) {
  return brief.topic || brief.creativeBrief?.topic || brief.contentScript?.topic || brief.plan?.topic || "";
}

function normalizeFreshnessText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeFreshnessText(text) {
  return normalizeFreshnessText(text)
    .split(" ")
    .filter((word) => word.length > 3 && !freshnessStopWords.has(word));
}

function createBigrams(tokens) {
  const bigrams = [];
  for (let index = 0; index < tokens.length - 1; index += 1) {
    bigrams.push(`${tokens[index]} ${tokens[index + 1]}`);
  }
  return bigrams;
}

function countTokenOverlap(left, right) {
  const rightTokens = new Set(right);
  return [...new Set(left)].filter((token) => rightTokens.has(token)).length;
}
