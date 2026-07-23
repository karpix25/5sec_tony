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
    .filter((item) => isImageReferenceUrl(item.url))
    .map((item) => ({ ...item, isLocalData: isDataImageUrl(item.url) }))
    .slice(0, 16);
}

function isRemoteImageUrl(value) { return /^https?:\/\//.test(String(value || "")); }
function isDataImageUrl(value) { return /^data:image\/(?:png|jpe?g|webp);base64,/i.test(String(value || "")); }
function isImageReferenceUrl(value) {
  return isRemoteImageUrl(value) || isDataImageUrl(value) || /^\/api\/reference-assets\/[^/?#]+/.test(String(value || ""));
}
