export function formatAvatarCornerCompositionPolicy({ productVisualMode, hasProductReference } = {}) {
  return [
    "КОМПОЗИЦИЯ ПОД АВАТАР: нижний правый угол работает как чистое негативное пространство под будущий video/avatar overlay.",
    "Примерно правые 40% нижней трети кадра заняты спокойным фоном, световым пятном, мягкой формой или пустым визуальным островом.",
    "Текстовая структура, ранги, карточки и ключевые картинки собраны левее и выше; нижний правый угол остается легким и открытым.",
    productVisualMode === "exact-product"
      ? formatExactProductCornerRule(hasProductReference)
      : formatNoProductCornerRule()
  ].filter(Boolean).join(" ");
}

function formatExactProductCornerRule(hasProductReference) {
  if (hasProductReference) {
    return "ПРОДУКТ В КАДРЕ: внешний вид продукта берется из product reference images; продукт размещен как точный брендовый объект в рабочей зоне кадра.";
  }
  return "PRODUCT REFERENCE ОТСУТСТВУЕТ: визуальный акцент строится как retention visual вокруг темы: ситуация, метафора, свет или фактура.";
}

function formatNoProductCornerRule() {
  return [
    "ПРОДУКТ ОСТАЕТСЯ ЗА КАДРОМ: визуальный акцент работает как retention visual для темы.",
    "Подходящие визуальные решения: контраст, метафора, эмоция, бытовая ситуация, иконка, паттерн, свет, фактура или сюжетный visual hook.",
    "Визуальная деталь усиливает удержание и помогает прочитать смысл за первую секунду."
  ].join(" ");
}
