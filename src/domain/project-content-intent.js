export function isTravelContentProject(project, product) {
  const source = normalizeIntentText([
    project?.niche,
    project?.projectTheme,
    project?.companyInfo,
    project?.keyScenarios,
    product?.description,
    product?.offer,
    intentListText(product?.facts)
  ].join(" "));
  return /туризм|турист|путешеств|поездк|достопримеч|маршрут|travel/.test(source);
}

export function isPaymentProject(project, product) {
  if (isTravelContentProject(project, product)) return false;
  const source = normalizeIntentText([
    project?.niche,
    project?.projectTheme,
    project?.companyInfo
  ].join(" "));
  return /финтех|оплат|зарубеж|банк|санкци|рубл|подпис|сервис/.test(source);
}

function intentListText(value) {
  return Array.isArray(value) ? value.join(" ") : String(value || "");
}

function normalizeIntentText(value) {
  return String(value || "").toLowerCase();
}
