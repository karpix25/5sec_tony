const operationalSideTopicPattern = /упаковк|мембран|вскрыт|доставк|получени[ея]\s+заказ|маркетплейс|сертификат|сгр|документ(?:ы|ов)|сумк|чемодан|производств(?:о|а)\s+в\s+(?:рф|росси)|произведен[а-яё]*\s+в\s+(?:рф|росси)|сделан[а-яё]*\s+в\s+(?:рф|росси)/i;
const wellnessContextPattern = /бад|wellness|нутрицевт|хлорофилл|добавк/i;
const unsafeWellnessTopicPattern = /детокс|токсин|похуд|микробиом|кишеч|жкт|вздут|от[её]к|припух|пищевар|аппетит|самочувств|кож|запах|дезодор|иммун|окислительн|клет|кислород|митохондр|организм/i;
const cosmeticContextPattern = /космет|уход.{0,16}кож|кож.{0,16}уход|гель.{0,12}душ|скраб|крем|сыворот|дезодорант/i;
const unsafeCosmeticTopicPattern = /гиперкерат|дермат|экзем|псориаз|акне|прыщ|высыпани|диагноз|гормон|микробиом|бактери|стресс|недосып|питани.{0,24}кож|образ.{0,16}жизн.{0,24}кож/i;

export const editorialTopicRules = [
  "Safe facts подтверждают выбранную тему, но сами по себе не становятся темой публикации.",
  "Смежная тема допустима, только если она помогает применить продукт, решить его основную задачу, получить ожидаемую пользу или избежать ошибки использования.",
  "Не превращай доставку, получение заказа, маркетплейс, мембрану, сертификаты, документы и производство в самостоятельную тему, если сам продукт не относится к упаковке, логистике, торговле или сертификации.",
  "Перед выбором темы сформулируй одним предложением ее связь с основной задачей продукта. Если связь натянутая, выбери другой угол."
];

export function isEditorialTopicEligible({ text, project = {}, product = {}, contentDirection = null } = {}) {
  const topic = String(text || "");
  const context = getProductCategoryContext(project, product);
  if (wellnessContextPattern.test(context) && unsafeWellnessTopicPattern.test(topic)) return false;
  if (cosmeticContextPattern.test(context) && unsafeCosmeticTopicPattern.test(topic)) return false;
  if (!operationalSideTopicPattern.test(topic)) return true;
  if (contentDirection?.kind === "custom") return true;
  return operationalSideTopicPattern.test(getOperationalCategoryContext(project, product));
}

export function isContentDirectionTopicEligible({ text, contentDirection = null } = {}) {
  if (!contentDirection) return true;
  if (!operationalSideTopicPattern.test(String(text || ""))) return true;
  return contentDirection?.kind === "custom";
}

export function hasOperationalTopic(text) {
  return operationalSideTopicPattern.test(String(text || ""));
}

function getOperationalCategoryContext(project, product) {
  return [product.name, project.niche, project.projectTheme].filter(Boolean).join(" ");
}

function getProductCategoryContext(project, product) {
  const passport = product.aiPassport || {};
  return [
    product.name,
    product.description,
    passport.category,
    passport.plainDescription,
    project.niche,
    project.projectTheme
  ].filter(Boolean).join(" ");
}
