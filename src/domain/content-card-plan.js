export function createContentCardPlan(strategy) {
  const points = normalizePoints(strategy.points);
  return {
    headline: strategy.hook,
    subhead: strategy.nicheFact,
    body: strategy.productBridge,
    points,
    footer: strategy.disclaimer || strategy.cta,
    visibleText: [
      strategy.hook,
      strategy.nicheFact,
      ...points,
      strategy.disclaimer || strategy.cta
    ].filter(Boolean),
    layout: pickLayout(strategy.format)
  };
}

function normalizePoints(points = []) {
  return points
    .map((item) => String(item || "").replace(/^\d+[\).:-]?\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 5);
}

function pickLayout(format) {
  const map = {
    checklist: "верхний хук, крупный тезис, 5 коротких пунктов, финальная строка осторожности",
    comparison: "верхний хук, две колонки сравнения, короткий вывод внизу",
    scheme: "верхний хук, центральная схема, подписи к ключевым узлам",
    "mistake-solution": "верхний хук, ошибка слева, правильный маршрут справа",
    "product-stack": "верхний хук, цепочка сервисов, эффект домино"
  };
  return map[format] || "верхний хук, сильный тезис, короткие смысловые блоки";
}
