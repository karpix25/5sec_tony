export function formatAvatarCornerCompositionPolicy({ productVisualMode, hasProductReference } = {}) {
  return [
    "КОМПОЗИЦИЯ ПОД АВАТАР: нижний правый угол держать как чистое негативное пространство под будущий video/avatar overlay.",
    "Оставь примерно правые 40% нижней трети кадра без текста, номеров, карточек, логотипов, продукта, важных иконок и смысловых объектов.",
    "Текстовую структуру, ранги, карточки и ключевые картинки располагай левее и выше; нижний правый угол может быть фоном, световым пятном, мягкой формой или пустым визуальным островом.",
    productVisualMode === "exact-product"
      ? formatExactProductCornerRule(hasProductReference)
      : formatNoProductCornerRule()
  ].filter(Boolean).join(" ");
}

function formatExactProductCornerRule(hasProductReference) {
  if (hasProductReference) {
    return "ЕСЛИ ПРОДУКТ В КАДРЕ: брать внешний вид только из product reference images; не придумывать похожую упаковку, аналог, generic bottle/jar/box или новую этикетку.";
  }
  return "ЕСЛИ PRODUCT REFERENCE НЕ ПЕРЕДАН: не показывать физический продукт и не заменять его generic-аналогом.";
}

function formatNoProductCornerRule() {
  return [
    "ЕСЛИ ПРОДУКТА НЕТ В ГЕНЕРАЦИИ: не вставлять сам продукт и не заменять его аналогами продукта.",
    "Запрещены бутылки, банки, флаконы, коробки, тюбики, блистеры, капсулы, стакан с продуктовым напитком, этикетки, packshot и любые похожие товарные объекты.",
    "Картинка должна улучшать удержание через контраст, метафору, эмоцию, ситуацию, иконку, паттерн, свет, фактуру или сюжетный visual hook без товарного предмета."
  ].join(" ");
}
