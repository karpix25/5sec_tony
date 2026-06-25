import { scenarioPatterns } from "./creative-patterns.js";
import { createContentLayer } from "./content-layers.js";

const genericSlots = scenarioPatterns.map((pattern) => ({
  id: pattern.id,
  format: pattern.format,
  angle: pattern.planShape,
  topic: pattern.topic,
  hook: pattern.hook,
  visualObject: pattern.visualObject,
  meaningPatternId: pattern.id
}));

export function createContentSlot({ project, product, existingJobs = [] }) {
  const slots = pickContentSlots(project, product);
  const used = new Set(existingJobs.map((job) => job.semanticKey || classifyJob(job, slots)));
  const slot = slots.find((item) => !used.has(item.id)) || slots[existingJobs.length % slots.length];
  return enrichSlotWithLayer(slot, { project, product, existingJobs });
}

export function refreshContentSlotLayer(slot, { project, product, existingJobs = [] }) {
  if (slot?.lockTopic) return slot;
  const baseSlot = pickContentSlots(project, product).find((item) => item.id === slot?.id) || slot;
  return enrichSlotWithLayer(baseSlot, { project, product, existingJobs });
}

function pickContentSlots(project, product) {
  return genericSlots;
}

export function createRecentJobDigest(existingJobs = []) {
  return existingJobs.slice(0, 30).map((job) => ({
    title: job.title || "",
    topic: job.topic || "",
    semanticKey: job.semanticKey || "",
    meaningPatternId: job.meaningPatternId || "",
    format: job.format || "",
    contentLayerId: job.contentLayerId || job.diversitySlot?.contentLayer?.id || "",
    contentLayerSubject: job.diversitySlot?.contentLayer?.subject || "",
    hookType: job.hookIntelligence?.hookType || "",
    layoutType: job.layoutContentPlan?.layoutType || ""
  }));
}

function enrichSlotWithLayer(slot, { project, product, existingJobs }) {
  const contentLayer = createContentLayer({ project, product: product || getJobProductFallback(project), existingJobs });
  return {
    ...slot,
    contentLayer,
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
