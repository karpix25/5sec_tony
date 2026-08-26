import { scenarioPatterns } from "./creative-patterns.js";
import { createContentLayer } from "./content-layers.js";
import { getProductContentDirections, pickContentDirection } from "./product-content-directions.js";

const genericSlots = scenarioPatterns.map((pattern) => ({
  id: pattern.id,
  format: pattern.format,
  angle: pattern.planShape,
  topic: pattern.topic,
  hook: pattern.hook,
  visualObject: pattern.visualObject,
  meaningPatternId: pattern.id
}));

export function createContentSlot({ project, product, existingJobs = [], contentDirectionIds = [] }) {
  const slots = pickContentSlots(project, product);
  const used = new Set(existingJobs.map((job) => job.semanticKey || classifyJob(job, slots)));
  const slot = slots.find((item) => !used.has(item.id)) || slots[existingJobs.length % slots.length];
  return enrichSlotWithLayer(slot, { project, product, existingJobs, contentDirectionIds });
}

export function refreshContentSlotLayer(slot, { project, product, existingJobs = [], contentDirectionIds = [] }) {
  if (slot?.lockTopic) return slot;
  const baseSlot = pickContentSlots(project, product).find((item) => item.id === slot?.id) || slot;
  return enrichSlotWithLayer(baseSlot, { project, product, existingJobs, contentDirectionIds, preservedDirection: slot?.contentDirection });
}

function pickContentSlots(project, product) {
  return genericSlots;
}

export function createGenerationHistory(existingJobs = [], { product = {}, productId = product?.id || "" } = {}) {
  const sameProduct = existingJobs.filter((job) => !productId || job.productId === productId);
  if (!getProductContentDirections(product)) return sameProduct;
  return sameProduct.filter((job) => Boolean(getJobContentDirectionId(job)));
}

export function createRecentJobDigest(existingJobs = [], options = {}) {
  return selectRecentJobs(createGenerationHistory(existingJobs, options), 30).map((job) => ({
    title: job.title || "",
    topic: job.topic || "",
    semanticKey: job.semanticKey || "",
    meaningPatternId: job.meaningPatternId || "",
    format: job.format || "",
    contentLayerId: job.contentLayerId || job.diversitySlot?.contentLayer?.id || "",
    contentLayerSubject: job.diversitySlot?.contentLayer?.subject || "",
    contentDirectionId: job.diversitySlot?.contentDirection?.id || "",
    hookType: job.hookIntelligence?.hookType || "",
    attentionFrame: job.attentionFrame || "",
    layoutType: job.layoutContentPlan?.layoutType || ""
  }));
}

export function getJobContentDirectionId(job = {}) {
  return job.diversitySlot?.contentDirection?.id
    || job.contentDirection?.id
    || "";
}

export function selectRecentJobs(existingJobs = [], limit = existingJobs.length) {
  return existingJobs
    .map((job, index) => ({ job, index, createdAt: Date.parse(job.createdAt || "") || 0 }))
    .sort((left, right) => right.createdAt - left.createdAt || right.index - left.index)
    .slice(0, limit)
    .map(({ job }) => job);
}

function enrichSlotWithLayer(slot, { project, product, existingJobs, contentDirectionIds = [], preservedDirection = null }) {
  const contentLayer = createContentLayer({ project, product: product || getJobProductFallback(project), existingJobs });
  const contentDirection = preservedDirection || pickContentDirection({ product, existingJobs, requestedIds: contentDirectionIds });
  return {
    ...slot,
    contentLayer,
    contentDirection,
    angle: `${slot.angle}; ${contentLayer.label}`,
    topic: "",
    hook: ""
  };
}

function getJobProductFallback(project) {
  return {
    name: project.projectTheme || project.name || "продукт",
    offer: project.audienceDesires || project.projectTheme || "",
    pains: project.audiencePains || "",
    facts: project.companyInfo || ""
  };
}

function classifyJob(job, slots) {
  const text = normalizeRotationText(`${job.topic || ""} ${job.title || ""}`);
  const matched = slots.find((slot) => {
    const haystack = normalizeRotationText(`${slot.id} ${slot.angle} ${slot.topic} ${slot.hook}`);
    return haystack.split(" ").some((word) => word.length > 5 && text.includes(word));
  });
  return matched?.id || "";
}

function normalizeRotationText(value) {
  return String(value || "").toLowerCase().replace(/[^a-zа-я0-9ё]+/gi, " ").trim();
}
