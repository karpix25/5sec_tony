import { hasProductVisualReference, resolveProductVisualMode } from "./product-visual-policy.js";

export function createProductVisibilityDecision({ project, product, generationBrief = {}, existingJobs = [] } = {}) {
  const requestedProductVisualMode = generationBrief.productVisualMode
    || generationBrief.productVisibilityDecision?.productVisualMode
    || generationBrief.productVisibilityDecision?.mode
    || resolveProductVisualMode({ project, product, generationBrief, existingJobs });
  const hasRefs = hasProductVisualReference(product);
  const productVisualMode = requestedProductVisualMode === "exact-product" && !hasRefs
    ? "no-package"
    : requestedProductVisualMode;
  const shouldPassProductRefs = productVisualMode === "exact-product" && hasRefs;
  return {
    version: "product-visibility-v1",
    productVisualMode,
    mode: productVisualMode,
    shouldPassProductRefs,
    hasProductRefs: hasRefs,
    percent: Number(project?.productInFramePercent ?? 30),
    reason: shouldPassProductRefs
      ? "product-selected-by-project-percent-and-history"
      : productVisualMode === "exact-product"
        ? "product-selected-but-no-usable-reference"
        : "content-slot-does-not-need-product-packshot",
    promptPolicy: shouldPassProductRefs
      ? "Pass product reference to LLM and image generator. Preserve real package shape, color, label, and SKU details."
      : "Do not pass product reference to image generator. Build a retention visual around the topic, problem, ritual, comparison, or metaphor."
  };
}
