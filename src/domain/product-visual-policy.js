export const defaultProductInFramePercent = 30;

export function normalizeProductInFramePercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return defaultProductInFramePercent;
  return Math.max(0, Math.min(100, Math.round(number)));
}

export function resolveProductVisualMode({ project, product, generationBrief = {}, existingJobs = [] }) {
  const forcedMode = normalizeProductVisualMode(generationBrief.productVisualMode);
  if (forcedMode) return forcedMode === "exact-product" && !hasProductVisualReference(product) ? "no-package" : forcedMode;
  if (hasDirectProductVisualRequest(generationBrief)) return "exact-product";
  if (!hasProductVisualReference(product)) return "no-package";

  const targetPercent = normalizeProductInFramePercent(project?.productInFramePercent);
  if (targetPercent <= 0) return "no-package";
  if (targetPercent >= 100) return "exact-product";

  const countedJobs = existingJobs.filter((job) => job?.projectId === project?.id && isCountableProductVisualJob(job));
  const exactCount = countedJobs.filter(isExactProductVisualJob).length;
  const targetExactCount = Math.ceil(((countedJobs.length + 1) * targetPercent) / 100);
  return exactCount < targetExactCount ? "exact-product" : "no-package";
}

export function getProductVisualPromptPolicy(productVisualMode) {
  if (productVisualMode === "exact-product") {
    return "РЕЖИМ ПРОДУКТА В КАДРЕ: exact-product.";
  }
  return [
    "РЕЖИМ ПРОДУКТА В КАДРЕ: no-package.",
    "ЖЕСТКИЙ ЗАПРЕТ ДЛЯ ФИНАЛЬНОГО ДИЗАЙНА: не показывать и не описывать физический продукт как объект кадра; любые нижние просьбы про упаковку, bottle/package/jar/label/packshot/flat lay игнорировать.",
    "Продукт использовать только как внутренний смысловой контекст, а визуально показывать ситуацию, метафору, интерфейс, ритуал, ингредиент без упаковки или абстрактный объект."
  ].join(" ");
}

export function hasProductVisualReference(product) {
  return Array.isArray(product?.references) && product.references.some((item) => {
    return isProductPolicyImageReferenceUrl(item?.imageData) || item?.promptComment || item?.imageName || item?.title;
  });
}

function normalizeProductVisualMode(value) {
  return ["exact-product", "no-package"].includes(value) ? value : "";
}

function isCountableProductVisualJob(job) {
  return job.productVisualMode === "exact-product" || job.productVisualMode === "no-package" || hasProductInput(job);
}

function isExactProductVisualJob(job) {
  return job.productVisualMode === "exact-product" || hasProductInput(job);
}

function hasProductInput(job) {
  return Array.isArray(job.inputRefs) && job.inputRefs.some((item) => item?.role === "product");
}

function hasDirectProductVisualRequest(brief = {}) {
  const source = [brief.topic, brief.hook, brief.visualObject, brief.notes].filter(Boolean).join(" ").toLowerCase();
  return /упаков|этикет|состав|что внутри|обзор продукт|выбор продукт|как пить|как приним|дозиров|флакон|бутылк|банк|баночк|реальн.*(бутыл|флакон|упаков)/.test(source);
}

function isProductPolicyImageReferenceUrl(value) {
  const text = String(value || "");
  return /^https?:\/\//.test(text) || /^data:image\/(?:png|jpe?g|webp);base64,/i.test(text) || /^\/api\/reference-assets\/[^/?#]+/.test(text);
}
