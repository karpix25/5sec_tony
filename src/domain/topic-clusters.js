import { normalizeProductAiPassport } from "./ai-artifacts.js";
import { isEditorialTopicEligible } from "./editorial-topic-policy.js";

const maxRecentJobs = 12;
const maxClusters = 10;

const clusterRules = [
  { id: "payment-services", label: "оплата и сервисы", pattern: /оплат|карт|банк|qr|налич|сервис|платеж|деньг|кошел|лимит/i },
  { id: "culture-etiquette", label: "культура и этикет", pattern: /культур|этикет|обыча|традиц|дресс|поведен|жест|табу|неловк/i },
  { id: "local-habits", label: "локальные привычки", pattern: /местн|локаль|привыч|свой|правил|ритуал|код/i },
  { id: "sights-routes", label: "достопримечательности и маршруты", pattern: /достопримеч|маршрут|музе|локац|город|регион|место/i },
  { id: "transport-logistics", label: "транспорт и логистика", pattern: /транспорт|логист|такси|метро|автобус|поезд|аэропорт|багаж|дорог/i },
  { id: "food-gastro", label: "еда и гастрономия", pattern: /еда|гастро|ресторан|кафе|кухн|чаев|напит|блюд/i },
  { id: "climate-season", label: "климат и сезонность", pattern: /климат|погод|сезон|жар|холод|дожд|температур|географ/i },
  { id: "trip-prep", label: "подготовка к поездке", pattern: /подготов|чек.?лист|заранее|поездк|планирован|собрать|провер/i },
  { id: "digital-travel", label: "цифровые инструменты в поездке", pattern: /цифров|бот|прилож|смартфон|интернет|онлайн|автомат/i },
  { id: "info-noise", label: "поиск актуальной информации", pattern: /информац|устар|шум|форум|блог|путевод|данн|актуаль/i }
];

export function createTopicClusterPlan({ project, product, existingJobs = [] } = {}) {
  const clusters = buildTopicClusters(product, project);
  const recentJobs = existingJobs.slice(0, maxRecentJobs);
  const scored = clusters
    .map((cluster, index) => scoreCluster(cluster, recentJobs, index, product?.id))
    .sort((left, right) => right.score - left.score);
  return {
    selected: scored[0] || null,
    available: scored.slice(0, maxClusters),
    recentClusterIds: recentJobs.map((job) => classifyTopicCluster(job, clusters)).filter(Boolean)
  };
}

export function buildTopicClusters(product = {}, project = {}) {
  const passport = normalizeProductAiPassport(product.aiPassport);
  const territory = passport.contentTerritory || {};
  const sources = [
    ...itemsToClusterSources(project.keyScenarios, "brandScenario"),
    ...itemsToClusterSources(project.audiencePains, "brandPain"),
    ...itemsToClusterSources(project.audienceDesires, "brandDesire"),
    ...itemsToClusterSources(territory.productWorld, "world"),
    ...itemsToClusterSources(territory.adjacentHelpfulTopics, "adjacent"),
    ...itemsToClusterSources(territory.guidesAndRecommendations, "guide"),
    ...itemsToClusterSources(territory.habitsAndMistakes, "habit"),
    ...itemsToClusterSources(territory.lifestyleContexts, "lifestyle"),
    ...itemsToClusterSources(project.projectTheme || project.niche, "brandTheme"),
    ...itemsToClusterSources(territory.directProductTopics, "direct"),
    ...itemsToClusterSources(passport.coreUseCases, "useCase"),
    ...itemsToClusterSources(passport.painSituations, "pain"),
    ...itemsToClusterSources(passport.desires, "desire")
  ].filter((source) => isEditorialTopicEligible({ text: source.text, project, product }));
  const grouped = new Map();
  for (const source of sources) {
    const base = resolveClusterRule(source.text);
    const existing = grouped.get(base.id) || {
      id: base.id,
      label: base.label,
      description: "",
      includeTerms: [],
      avoidTerms: [],
      sourceTypes: []
    };
    grouped.set(base.id, {
      ...existing,
      description: existing.description || source.text,
      includeTerms: uniqueClusterText([...existing.includeTerms, source.text]),
      sourceTypes: uniqueClusterText([...existing.sourceTypes, source.type])
    });
  }
  return [...grouped.values()].slice(0, maxClusters);
}

export function classifyTopicCluster(job = {}, clusters = []) {
  const text = normalizeClusterText([
    job.title,
    job.topic,
    job.creativeBrief?.topic,
    job.generationBrief?.creativeBrief?.topic,
    job.diversitySlot?.contentLayer?.subject,
    job.generationBrief?.topicCluster?.label,
    job.topicCluster?.label
  ].filter(Boolean).join(" "));
  const matched = clusters.find((cluster) => clusterMatchesText(cluster, text));
  return matched?.id || "";
}

function scoreCluster(cluster, recentJobs, index, productId) {
  const recentMatches = recentJobs.filter((job) => classifyTopicCluster(job, [cluster]) === cluster.id).length;
  const recentProductMatches = recentJobs.filter((job) => job.productId === productId && classifyTopicCluster(job, [cluster]) === cluster.id).length;
  const consecutiveMatches = countConsecutiveMatches(cluster, recentJobs);
  const hasBrandContext = cluster.sourceTypes.some((type) => ["brandScenario", "brandPain", "brandDesire"].includes(type));
  const hasAdjacentContext = cluster.sourceTypes.some((type) => ["adjacent", "guide", "habit", "lifestyle"].includes(type));
  const sourceBonus = hasBrandContext
    ? 5
    : hasAdjacentContext ? 3
    : cluster.sourceTypes.includes("safeFact") ? 2 : 1;
  return {
    ...cluster,
    score: 20 + sourceBonus - index - recentMatches * 5 - recentProductMatches * 20 - consecutiveMatches * 10,
    recentMatches,
    recentProductMatches,
    consecutiveMatches,
    cooldown: recentProductMatches >= 1 || consecutiveMatches >= 2 || recentMatches >= 3
  };
}

function countConsecutiveMatches(cluster, recentJobs) {
  let count = 0;
  for (const job of recentJobs) {
    if (classifyTopicCluster(job, [cluster]) !== cluster.id) break;
    count += 1;
  }
  return count;
}

function itemsToClusterSources(items = [], type) {
  return clusterAsArray(items).map((text) => ({ text, type }));
}

function resolveClusterRule(text) {
  return clusterRules.find((rule) => rule.pattern.test(text)) || {
    id: `product-${stableSlug(text)}`,
    label: text,
    pattern: /$^/
  };
}

function clusterMatchesText(cluster, normalizedText) {
  if (!normalizedText) return false;
  const rule = clusterRules.find((item) => item.id === cluster.id);
  if (rule?.pattern.test(normalizedText)) return true;
  if (normalizeClusterText(cluster.label) && normalizedText.includes(normalizeClusterText(cluster.label))) return true;
  return cluster.includeTerms.some((term) => {
    const normalizedTerm = normalizeClusterText(term);
    return normalizedTerm.split(" ").some((word) => word.length > 4 && normalizedText.includes(word));
  });
}

function clusterAsArray(value) {
  if (Array.isArray(value)) return value.map(cleanClusterText).filter(Boolean);
  return String(value || "").split(/\n|;/).map(cleanClusterText).filter(Boolean);
}

function uniqueClusterText(items) {
  return [...new Set(items.map(cleanClusterText).filter(Boolean))];
}

function cleanClusterText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeClusterText(value) {
  return cleanClusterText(value).toLowerCase().replace(/[^a-zа-я0-9ё]+/gi, " ").trim();
}

function stableSlug(value) {
  return normalizeClusterText(value).split(" ").filter((word) => word.length > 3).slice(0, 3).join("-") || "general";
}
