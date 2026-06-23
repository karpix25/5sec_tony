import { createAutoGenerationBrief, createSemanticPlan } from "./generation.js";
import { buildProductProfile } from "./product-profile.js";
import { getProductContentFocus } from "./product-content-focus.js";

export function createGenerationStrategy({ project, product, reference, generationBrief = {}, existingJobs = [], hookLibrary }) {
  const brief = createAutoGenerationBrief({ project, product, reference, generationBrief, existingJobs, hookLibrary });
  const semanticPlan = createSemanticPlan({ project, product, brief });
  const profile = buildProductProfile({ project, product, insightMap: brief.productInsightMap });
  const focus = getProductContentFocus({ project, product });
  const nicheFact = pickNicheFact({ semanticPlan, profile, focus, product });
  return {
    projectId: project.id,
    productId: product.id,
    projectName: project.name,
    productName: product.name,
    topic: brief.topic,
    hook: brief.hook,
    format: brief.format,
    semanticKey: brief.semanticKey,
    nicheFact,
    productInsight: pickFirst([profile.primaryUseCase, focus.context, product.description]),
    productBridge: buildProductBridge({ product, nicheFact, semanticPlan }),
    visualObject: brief.visualObject,
    referenceTitle: reference?.title || "",
    points: semanticPlan.points || [],
    cta: semanticPlan.cta || brief.cta || product.name,
    disclaimer: semanticPlan.disclaimer || "",
    sourceBrief: {
      semanticKey: brief.semanticKey,
      contentLayerId: brief.contentLayerId || "",
      meaningPatternId: brief.meaningPatternId || "",
      productVisualMode: brief.productVisualMode || "",
      compositionMode: brief.compositionMode || ""
    }
  };
}

function pickNicheFact({ semanticPlan, profile, focus, product }) {
  return pickFirst([
    cleanPoint(semanticPlan.points?.[0]),
    profile.primaryProof,
    focus.fact,
    product.description
  ]);
}

function buildProductBridge({ product, nicheFact, semanticPlan }) {
  const action = cleanPoint(semanticPlan.points?.at?.(-1));
  const offer = capitalize(product.offer || product.name);
  return pickFirst([
    action && `${action}. ${offer}`,
    `${nicheFact}. ${offer}`,
    product.description
  ]);
}

function pickFirst(items) {
  return items.map((item) => String(item || "").trim()).find(Boolean) || "";
}

function cleanPoint(value) {
  return String(value || "").replace(/^\d+[\).:-]?\s*/, "").trim();
}

function capitalize(value) {
  const text = String(value || "").trim();
  return text ? text[0].toUpperCase() + text.slice(1) : "";
}
