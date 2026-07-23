import { getSafeZoneInputReference } from "./safe-zone-reference.js";

export function getGenerationInputUrls({ reference, character, product }) {
  return getGenerationInputReferences({ reference, character, product }).map((item) => item.url);
}

export function getGenerationInputReferences({ reference, product, productVisualMode = "exact-product", productVisibilityDecision = null }) {
  const shouldPassProductRefs = productVisibilityDecision
    ? productVisibilityDecision.shouldPassProductRefs === true
    : productVisualMode === "exact-product";
  return [
    getSafeZoneInputReference(),
    {
      role: "design",
      title: reference?.title || "Design reference",
      url: reference?.imageData
    },
    ...(shouldPassProductRefs ? (product.references || []).map((item) => ({
      role: "product",
      title: item.title || item.imageName || "Product reference",
      url: item.imageData
    })) : [])
  ]
    .filter((item) => isGenerationImageReferenceUrl(item.url))
    .map((item) => ({ ...item, isLocalData: isGenerationDataImageUrl(item.url) }))
    .slice(0, 16);
}

function isGenerationRemoteImageUrl(value) { return /^https?:\/\//.test(String(value || "")); }
function isGenerationDataImageUrl(value) { return /^data:image\/(?:png|jpe?g|webp);base64,/i.test(String(value || "")); }
function isGenerationImageReferenceUrl(value) {
  return isGenerationRemoteImageUrl(value) || isGenerationDataImageUrl(value) || /^\/api\/reference-assets\/[^/?#]+/.test(String(value || ""));
}
