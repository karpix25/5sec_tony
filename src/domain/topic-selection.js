import { getUnsupportedClaimViolations } from "./content-claim-contract.js";
import { isContentDirectionTopicEligible, isEditorialTopicEligible } from "./editorial-topic-policy.js";
import { selectRecentJobs } from "./content-rotation.js";
import { buildTopicSimilarityKey, isSimilarTopicSignature } from "./topic-similarity.js";

const minimumEligibleTopicCount = 4;
const awarenessStages = new Set(["recognition", "problem", "need", "solution", "choice", "objection", "conversion"]);
const contentGoals = new Set(["reach", "save", "follow", "compare", "lead"]);

export function selectTopicSelection({ topicMap, project = {}, product = {}, existingJobs = [], contentDirection = null, random = Math.random } = {}) {
  const { eligible } = assessTopicMapQuality({ topicMap, project, product, contentDirection });
  const recentSignatures = selectRecentJobs(existingJobs, 30)
    .map((job) => buildTopicSimilarityKey([job.topicSelection?.theme, job.topic, job.title, job.creativeBrief?.topic]));
  const recentHardBlock = recentSignatures.slice(0, 2);
  const fresh = eligible.filter((candidate) => !recentSignatures.some((recent) => isSimilarTopicSignature(candidate.signature, recent)));
  const notRepeatedImmediately = eligible.filter((candidate) => !recentHardBlock.some((recent) => isSimilarTopicSignature(candidate.signature, recent)));
  const pool = fresh.length ? fresh : notRepeatedImmediately.length ? notRepeatedImmediately : eligible;
  const picked = pickOne(pool, random);
  return picked || createFallbackTopic(product, contentDirection);
}

export function assessTopicMapQuality({ topicMap, project = {}, product = {}, contentDirection = null } = {}) {
  const source = Array.isArray(topicMap) ? topicMap : topicMap?.topicMap || [];
  const candidates = readCandidates(topicMap);
  const rejected = candidates
    .map((candidate) => ({ candidate, reasons: getCandidateRejectionReasons(candidate, { project, product, contentDirection }) }))
    .filter(({ reasons }) => reasons.length);
  const eligible = candidates.filter((candidate) => !rejected.some(({ candidate: rejectedCandidate }) => rejectedCandidate === candidate));
  const feedback = [
    `Допустимых тем: ${eligible.length} из ${candidates.length}. Нужно минимум ${minimumEligibleTopicCount}.`,
    ...(source.length > candidates.length ? ["У части тем нет короткой темы или ясной связи с продуктом."] : []),
    ...rejected.slice(0, 6).map(({ candidate, reasons }) => `«${candidate.theme}»: ${reasons.join(", ")}.`)
  ];
  return { eligible, needsRetry: eligible.length < minimumEligibleTopicCount, feedback };
}

function readCandidates(topicMap = {}) {
  const source = Array.isArray(topicMap) ? topicMap : topicMap.topicMap || [];
  const unique = new Map();
  for (const item of source) {
    const candidate = normalizeCandidate(item);
    if (candidate && !unique.has(candidate.signature.text)) unique.set(candidate.signature.text, candidate);
  }
  return [...unique.values()];
}

function normalizeCandidate(value) {
  const source = value && typeof value === "object" ? value : {};
  const theme = clean(source.theme || source.topic);
  const situation = clean(source.situation);
  const productRelation = clean(source.productRelation || source.productBridge);
  if (!theme || !productRelation || theme.length > 100 || situation.length > 120 || productRelation.length > 140) return null;
  return {
    id: clean(source.id) || `topic-${buildTopicSimilarityKey([theme, situation]).text.slice(0, 48)}`,
    theme,
    situation,
    productRelation,
    directionId: clean(source.directionId || source.contentDirectionId),
    audienceSegment: clean(source.audienceSegment).slice(0, 100),
    awarenessStage: normalizeChoice(source.awarenessStage, awarenessStages),
    contentGoal: normalizeChoice(source.contentGoal, contentGoals),
    evidenceIds: cleanList(source.evidenceIds),
    signature: buildTopicSimilarityKey([theme, situation])
  };
}

function getCandidateRejectionReasons(candidate, { project, product, contentDirection }) {
  const text = [candidate.theme, candidate.situation, candidate.productRelation].filter(Boolean).join(". ");
  const reasons = [];
  const expectedDirectionId = clean(contentDirection?.id);
  if (expectedDirectionId && candidate.directionId !== expectedDirectionId) reasons.push("тема вне выбранного направления");
  if (!isEditorialTopicEligible({ text, project, product, contentDirection })
    || !isContentDirectionTopicEligible({ text, contentDirection })) {
    reasons.push("тема уводит от основной задачи продукта или затрагивает запрещённый угол");
  }
  const topicText = [candidate.theme, candidate.situation, candidate.productRelation].filter(Boolean).join(". ");
  if (getUnsupportedClaimViolations(
    { headline: topicText },
    { project, product, productPassport: product.aiPassport },
    { scope: "topic" }
  ).length) reasons.push("есть медицинское или неподтверждённое утверждение");
  return reasons;
}

function pickOne(items, random) {
  if (!items.length) return null;
  const value = Number(random());
  const index = Number.isFinite(value)
    ? Math.max(0, Math.min(items.length - 1, Math.floor(value * items.length)))
    : 0;
  return withoutSignature(items[index]);
}

function createFallbackTopic(product, contentDirection) {
  const theme = clean(contentDirection?.title || product.name || product.description) || "Тема продукта";
  return {
    id: contentDirection?.kind === "custom" ? clean(contentDirection.id) || "custom-topic" : "product-context",
    theme,
    situation: "",
    productRelation: contentDirection?.relation || "прямая тема продукта",
    directionId: clean(contentDirection?.id),
    fallback: true
  };
}

export function getTopicAlignmentViolations({ contentScript = {}, topicSelection = null, contentDirection = null } = {}) {
  const expectedDirectionId = clean(contentDirection?.id);
  if (!topicSelection && !expectedDirectionId) return [];
  if (expectedDirectionId && clean(topicSelection?.directionId) !== expectedDirectionId) return ["topic_direction_mismatch"];

  const topicText = [topicSelection?.theme, topicSelection?.situation, topicSelection?.productRelation].filter(Boolean).join(" ");
  const scriptText = [contentScript.headline, contentScript.subhead, ...(Array.isArray(contentScript.points) ? contentScript.points : [])]
    .filter(Boolean)
    .join(" ");
  const violations = isContentDirectionTopicEligible({ text: scriptText, contentDirection })
    ? []
    : ["content_direction_topic_mismatch"];
  if (!scriptText) return [];
  if (!topicText) return violations;
  if (!isSimilarTopicSignature(buildTopicSimilarityKey([topicText]), buildTopicSimilarityKey([scriptText]))) {
    violations.push("content_topic_mismatch");
  }
  return violations;
}

function withoutSignature({ signature, ...topic }) {
  return topic;
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeChoice(value, choices) {
  const normalized = clean(value).toLowerCase();
  return choices.has(normalized) ? normalized : "";
}

function cleanList(value) {
  const items = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(items.map(clean).filter(Boolean))].slice(0, 8);
}
