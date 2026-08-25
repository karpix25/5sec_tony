import { getUnsupportedClaimViolations } from "./content-claim-contract.js";
import { isEditorialTopicEligible } from "./editorial-topic-policy.js";
import { selectRecentJobs } from "./content-rotation.js";
import { buildTopicSimilarityKey, isSimilarTopicSignature } from "./topic-similarity.js";

export function selectTopicSelection({ topicMap, project = {}, product = {}, existingJobs = [], random = Math.random } = {}) {
  const candidates = readCandidates(topicMap)
    .filter((candidate) => isAllowedCandidate(candidate, { project, product }));
  const recentSignatures = selectRecentJobs(existingJobs, 30)
    .map((job) => buildTopicSimilarityKey([job.topicSelection?.theme, job.topic, job.title, job.creativeBrief?.topic]));
  const fresh = candidates.filter((candidate) => !recentSignatures.some((recent) => isSimilarTopicSignature(candidate.signature, recent)));
  const picked = pickOne(fresh.length ? fresh : candidates, random);
  return picked || createFallbackTopic(product);
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
  return { id: clean(source.id) || `topic-${buildTopicSimilarityKey([theme, situation]).text.slice(0, 48)}`, theme, situation, productRelation, signature: buildTopicSimilarityKey([theme, situation]) };
}

function isAllowedCandidate(candidate, { project, product }) {
  const text = [candidate.theme, candidate.situation, candidate.productRelation].filter(Boolean).join(". ");
  return isEditorialTopicEligible({ text, project, product })
    && getUnsupportedClaimViolations({ headline: text }, { project, product, productPassport: product.aiPassport }).length === 0;
}

function pickOne(items, random) {
  if (!items.length) return null;
  const value = Number(random());
  const index = Number.isFinite(value)
    ? Math.max(0, Math.min(items.length - 1, Math.floor(value * items.length)))
    : 0;
  return withoutSignature(items[index]);
}

function createFallbackTopic(product) {
  const theme = clean(product.name || product.description) || "Тема продукта";
  return { id: "product-context", theme, situation: "", productRelation: "прямая тема продукта", fallback: true };
}

function withoutSignature({ signature, ...topic }) {
  return topic;
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}
