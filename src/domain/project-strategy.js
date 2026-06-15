const fieldLabels = {
  projectTheme: "Тема проекта",
  niche: "Ниша",
  keyScenarios: "Сценарные кластеры",
  audiencePains: "Боли аудитории",
  audienceDesires: "Желания аудитории",
  audienceObjections: "Возражения аудитории",
  allowedTriggers: "Разрешенные триггеры",
  forbiddenTriggers: "Запрещенные триггеры",
  hookAggression: "Степень агрессивности хуков",
  contentRestrictions: "Контентные ограничения"
};

export function generateProjectStrategyField(project, products, fieldName) {
  const productNames = products.map((product) => product.name).join(", ") || "продукты проекта";
  const pains = collect(products, "pains").join("; ") || project.companyAudience || "ключевые боли аудитории";
  const facts = collect(products, "facts").join("; ") || "подтвержденные факты из продуктов";
  const forbidden = collect(products, "forbidden").join("; ") || project.restrictions || "опасные обещания";
  const themeBase = project.projectTheme || project.name || productNames;

  const drafts = {
    projectTheme: `${themeBase}: системная генерация вертикальных инфографик для аудитории проекта.`,
    niche: inferNiche(project, productNames),
    keyScenarios: [
      `Срочная ситуация: аудитории нужен ${productNames}, потому что проблема уже мешает действовать.`,
      "Ошибка пользователя: человек делает привычное действие, но получает плохой результат.",
      "Скрытая причина: аудитория видит симптом проблемы, но не понимает источник.",
      "Чеклист перед выбором: что проверить до покупки, заявки или решения.",
      "Возражение и доверие: человек боится риска, переплаты, обмана или недоказанных обещаний.",
      "Сравнение вариантов: почему один подход удобнее, спокойнее или понятнее другого.",
      "Миф и заблуждение: распространенное мнение, которое мешает принять решение."
    ].join("\n"),
    audiencePains: pains,
    audienceDesires: [
      "быстро понять, что происходит",
      "увидеть простое решение без сложной терминологии",
      "получить уверенность перед покупкой или обращением"
    ].join("\n"),
    audienceObjections: [
      "не верю громким обещаниям",
      "не понимаю, подойдет ли мне",
      "боюсь потратить деньги зря",
      "хочу факты, а не давление"
    ].join("\n"),
    allowedTriggers: [
      "ошибки, которые аудитория узнает в себе",
      "признаки, чеклисты и схемы",
      "неочевидные причины проблемы",
      "мягкий FOMO без страха и манипуляций"
    ].join("\n"),
    forbiddenTriggers: forbidden,
    hookAggression: project.hookAggression || "Средняя: сильные триггерные хуки, но без паники, стыда, диагнозов и недоказанных гарантий.",
    contentRestrictions: [project.restrictions, forbidden, facts ? `Опираемся только на факты: ${facts}.` : ""].filter(Boolean).join("\n")
  };

  return drafts[fieldName] || `${fieldLabels[fieldName] || "Поле"}: черновик на основе проекта, ЦА и продуктов.`;
}

function inferNiche(project, productNames) {
  const liveProjectSource = `${project.projectTheme || ""} ${project.niche || ""} ${project.companyInfo || ""} ${project.companyAudience || ""}`.toLowerCase();
  if (isPaymentNiche(liveProjectSource)) return "финтех / трансграничные платежи / оплата зарубежных сервисов";
  const source = `${liveProjectSource} ${productNames}`.toLowerCase();
  if (/бад|магни|коллаген|пробиотик|инозитол|wellness/.test(source)) return "wellness / нутрицевтика / забота о самочувствии";
  if (/beauty|космет|сыворот|кожа|уход/.test(source)) return "beauty / косметика / уход";
  if (isPaymentNiche(source)) return "финтех / трансграничные платежи / оплата зарубежных сервисов";
  return "универсальная продуктовая ниша на основе компании и выбранных продуктов";
}

function isPaymentNiche(source) {
  return /финтех|оплат|зарубеж|рубл|подпис|сервис|карта|банк|санкци/.test(source);
}

function collect(products, key) {
  return products.flatMap((product) => {
    const value = product[key];
    return Array.isArray(value) ? value : String(value || "").split(/\n|;/);
  }).map((item) => item.trim()).filter(Boolean);
}
