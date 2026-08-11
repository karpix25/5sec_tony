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
    return "ПЛАН ВИЗУАЛИЗАЦИИ ПРОДУКТА: product-present. Физический продукт является видимым объектом кадра и собирается по product reference.";
  }
  return [
    "ПЛАН ВИЗУАЛИЗАЦИИ ПРОДУКТА: product-absent.",
    "Товарный слой используется как внутренний смысловой контекст для темы.",
    "Видимый кадр строится через ситуацию, метафору, интерфейс, ритуал, абстрактный объект, свет, фактуру или visual hook для удержания.",
    "Все видимые объекты поддерживают тему поста и читаются как самостоятельная полезная инфографика."
  ].join(" ");
}

export function formatProductVisualContext(product, productVisualMode, compactText = defaultCompactText) {
  if (productVisualMode === "exact-product") {
    return [
      `Продукт для визуального показа: ${product?.name || ""}. ${product?.description ? `Описание внешнего/смыслового контекста: ${compactText(product.description, 650)}.` : ""}`,
      product?.components ? `Состав или активные компоненты: ${compactText(product.components, 600)}.` : ""
    ].filter(Boolean).join(" ");
  }
  return [
    "Внутренний контекст категории продукта без визуализации товара.",
    "Название продукта, бренд и SKU остаются только внутренними данными для выбора темы.",
    product?.offer ? `Смысловой оффер без названия продукта: ${compactText(product.offer, 360)}.` : "",
    product?.description ? `Безопасный контекст: ${compactText(removeProductObjectWords(product.description), 420)}.` : ""
  ].filter(Boolean).join(" ");
}

export function hasProductVisualReference(product) {
  return Array.isArray(product?.references) && product.references.some((item) => {
    return isProductPolicyImageReferenceUrl(item?.imageData);
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

function removeProductObjectWords(value) {
  return String(value || "")
    .replace(/\b(?:bottle|package|jar|label|packshot|flat\s*lay|sku)\b/gi, "")
    .replace(/упаковк\w*|этикетк\w*|флакон\w*|бутылк\w*|баночк\w*|банка|sku/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function defaultCompactText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}
