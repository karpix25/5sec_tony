const operationalSideTopicPattern = /упаковк|мембран|вскрыт|доставк|получени[ея]\s+заказ|маркетплейс|сертификат|сгр|документ(?:ы|ов)|производств(?:о|а)\s+в\s+(?:рф|росси)|произведен[а-яё]*\s+в\s+(?:рф|росси)|сделан[а-яё]*\s+в\s+(?:рф|росси)/i;
const wellnessContextPattern = /бад|wellness|нутрицевт|хлорофилл|добавк/i;
const unsafeWellnessTopicPattern = /детокс|токсин|похуд|микробиом|кишеч|жкт|кож|запах|дезодор|иммун|окислительн|клет|кислород|митохондр|организм/i;

export const editorialTopicRules = [
  "Safe facts подтверждают выбранную тему, но сами по себе не становятся темой публикации.",
  "Смежная тема допустима, только если она помогает применить продукт, решить его основную задачу, получить ожидаемую пользу или избежать ошибки использования.",
  "Не превращай доставку, получение заказа, маркетплейс, мембрану, сертификаты, документы и производство в самостоятельную тему, если сам продукт не относится к упаковке, логистике, торговле или сертификации.",
  "Перед выбором темы сформулируй одним предложением ее связь с основной задачей продукта. Если связь натянутая, выбери другой угол."
];

export function isEditorialTopicEligible({ text, project = {}, product = {} } = {}) {
  const topic = String(text || "");
  const context = getProductCategoryContext(project, product);
  if (wellnessContextPattern.test(context) && unsafeWellnessTopicPattern.test(topic)) return false;
  if (!operationalSideTopicPattern.test(topic)) return true;
  return operationalSideTopicPattern.test(context);
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
