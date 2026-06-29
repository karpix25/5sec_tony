export function getProductReferenceTransferInstruction({ remoteProductRefs, localProductRefs, productVisualMode }) {
  const productRefCount = remoteProductRefs + localProductRefs;
  if (productVisualMode === "exact-product" && productRefCount) {
    return [
      `PRODUCT REFERENCE PLAN: product-present, передано ${productRefCount} product reference image(s).`,
      "Локальные product reference images будут опубликованы как S3/public URL перед запросом к генератору; считай их доступными для image-to-image.",
      "Тема требует показать продукт: продукт должен быть визуально виден в кадре.",
      "Внешний вид продукта повторяет product reference: форма, цвет, этикетка, название, крышка, коробка и SKU."
    ].join(" ");
  }
  return [
    "PRODUCT REFERENCE PLAN: product-absent.",
    "Product reference images остаются вне image-to-image входа для этой генерации.",
    "Визуальная идея собирается как retention visual: ситуация, ритуал, интерфейс, предмет боли, абстрактный объект, свет или фактура."
  ].join(" ");
}
