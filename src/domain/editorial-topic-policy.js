const operationalSideTopicPattern = /упаковк|мембран|вскрыт|доставк|получени[ея]\s+заказ|маркетплейс|сертификат|сгр|документ(?:ы|ов)|производств(?:о|а)\s+в\s+(?:рф|росси)/i;

export const editorialTopicRules = [
  "Safe facts подтверждают выбранную тему, но сами по себе не становятся темой публикации.",
  "Смежная тема допустима, только если она помогает применить продукт, решить его основную задачу, получить ожидаемую пользу или избежать ошибки использования.",
  "Не превращай доставку, получение заказа, маркетплейс, мембрану, сертификаты, документы и производство в самостоятельную тему, если сам продукт не относится к упаковке, логистике, торговле или сертификации.",
  "Перед выбором темы сформулируй одним предложением ее связь с основной задачей продукта. Если связь натянутая, выбери другой угол."
];

export function isEditorialTopicEligible({ text, project = {}, product = {} } = {}) {
  if (!operationalSideTopicPattern.test(String(text || ""))) return true;
  return operationalSideTopicPattern.test(getProductCategoryContext(project, product));
}

function getProductCategoryContext(project, product) {
  const passport = product.aiPassport || {};
  return [
    product.name,
    product.description,
    passport.category,
    passport.plainDescription,
    passport.contentTerritory?.productWorld,
    project.niche,
    project.projectTheme
  ].filter(Boolean).join(" ");
}
