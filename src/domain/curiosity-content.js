import { validateCreativeBrief } from "./creative-quality-validator.js";
import { getProductContentFocus } from "./product-content-focus.js";
import { buildProductProfile } from "./product-profile.js";
import { isPaymentProject, isTravelContentProject } from "./project-content-intent.js";

const travelFacts = [
  {
    place: "Япония",
    fact: "чаевые часто воспринимают как неловкость, а не как благодарность",
    situation: "турист хочет быть вежливым и оставляет деньги на столе",
    action: "проверить местную норму оплаты до первого ресторана"
  },
  {
    place: "Италия",
    fact: "капучино после обеда может выглядеть как странный туристический выбор",
    situation: "привычный заказ внезапно выдает новичка",
    action: "смотреть не только меню, но и время местной привычки"
  },
  {
    place: "ОАЭ",
    fact: "публичные правила поведения могут быть важнее красивого маршрута",
    situation: "план поездки есть, а локальные ограничения не проверены",
    action: "проверить правила места до фото, пляжа или торгового центра"
  },
  {
    place: "Таиланд",
    fact: "обувь и жесты в храме могут сказать больше, чем слова",
    situation: "турист помнит маршрут, но забывает про местный контекст",
    action: "уточнить маленькие правила до входа в храм или дом"
  },
  {
    place: "Франция",
    fact: "расписание и перерывы легко ломают идеальный маршрут",
    situation: "место в списке есть, но время визита выбрано вслепую",
    action: "проверить часы, выходные и правила бронирования заранее"
  }
];

const curiosityPaymentFacts = {
  "card-rejected": {
    fact: "зарубежный сервис может отклонить оплату не из-за суммы, а из-за страны или типа карты",
    situation: "карта снова не проходит, хотя денег достаточно",
    action: "сначала понять причину отказа, потом выбирать маршрут оплаты"
  },
  "subscription-deadline": {
    fact: "подписка часто отключается автоматически после неудачного списания",
    situation: "доступ нужен сегодня, а дата списания уже горит",
    action: "проверить срок, сервис и подтверждение до последнего часа"
  },
  "invoice-payment": {
    fact: "в инвойсе важны не только сумма, но и получатель, срок и назначение платежа",
    situation: "счет выглядит понятным, пока не начинается оплата",
    action: "разобрать поля счета до перевода денег"
  },
  default: {
    fact: "в зарубежной оплате чаще ломается сценарий, а не одна кнопка оплаты",
    situation: "сервис нужен срочно, но условия непонятны",
    action: "собрать сервис, срок, сумму и ограничения в один маршрут"
  }
};

const productFacts = {
  magnesium: {
    fact: "вечерняя рутина сильнее сбивается от света, позднего кофе и хаотичного времени сна, чем от одной пропущенной добавки",
    situation: "человек пытается уснуть, но держит мозг в дневном режиме до последней минуты",
    action: "сначала убрать яркий экран и поздний кофе, потом добавлять вечернюю привычку"
  },
  collagen: {
    fact: "коллаген и витамин C работают как привычка: важнее регулярность, белок в рационе и вода, а не разовый прием перед важным днем",
    situation: "кожа выглядит тусклой, а уход вспоминают только перед зеркалом",
    action: "проверить регулярность, рацион и простой ежедневный формат"
  },
  serum: {
    fact: "пептидная сыворотка лучше раскрывается в спокойной вечерней рутине, когда кожу не перегружают активами",
    situation: "кожа выглядит усталой, а полка с уходом уже похожа на эксперимент",
    action: "сделать патч-тест и не смешивать несколько активов в один вечер"
  }
};

export function createCuriosityContentPlan({ project, product, brief, layoutPlan, hookIntelligence, existingJobs = [] }) {
  const productFact = pickProductFact({ project, product, brief });
  const curiosityAngle = buildCuriosityAngle({ project, product, brief, productFact, hookIntelligence });
  const finalContent = buildFinalContent({ project, product, brief, productFact, curiosityAngle, layoutPlan });
  const creativeQuality = validateCreativeBrief({
    draft: {
      ...brief,
      productFact: productFact.fact,
      scrollStopperAngle: curiosityAngle.conflict,
      finalContent,
      plan: finalContent
    },
    project,
    product,
    layoutPlan,
    hookIntelligence,
    existingJobs
  });
  return { productFact, curiosityAngle, finalContent, creativeQuality };
}

export function formatFinalContentPrompt(content) {
  if (!content?.headline) return "";
  return [
    "ФИНАЛЬНЫЙ ТЕКСТ ДЛЯ КАРТИНКИ: используй этот текст как контракт, не придумывай новые темы и пункты.",
    `Заголовок: ${content.headline}.`,
    `Подзаголовок: ${content.subhead}.`,
    `Блоки: ${content.points.join(" | ")}.`,
    "Можно менять переносы строк под дизайн, но нельзя заменять смысл общими советами."
  ].join(" ");
}

function pickProductFact({ project, product, brief }) {
  if (isTravelContentProject(project, product)) return pickTravelFact({ project, product, brief });
  if (isPaymentProject(project, product)) return curiosityPaymentFacts[brief.semanticKey] || curiosityPaymentFacts.default;
  if (productFacts[product.id]) return personalizeProductFact(productFacts[product.id], { project, product, brief });
  const profile = buildProductProfile({ project, product, insightMap: brief.productInsightMap });
  const focus = getProductContentFocus({ project, product });
  return {
    fact: pickConcrete([
      focus.fact,
      profile.primaryProof,
      ...profile.proofPoints,
      product.components,
      product.description
    ], product.name),
    situation: pickConcrete([
      focus.pain,
      profile.primaryPain,
      ...profile.painMap,
      focus.context
    ], product.name),
    action: pickConcrete([
      focus.action,
      profile.safeClaims[0],
      product.offer,
      focus.subject
    ], product.name)
  };
}

function pickTravelFact({ project, product, brief }) {
  const seed = `${project.name} ${product.name} ${brief.topic} ${brief.hook}`;
  return travelFacts[Math.abs(hashText(seed)) % travelFacts.length];
}

function personalizeProductFact(fact, { project, product, brief }) {
  const profile = buildProductProfile({ project, product, insightMap: brief.productInsightMap });
  const focus = getProductContentFocus({ project, product });
  return {
    ...fact,
    situation: pickConcrete([focus.pain, profile.primaryPain, ...profile.painMap, fact.situation], product.name),
    action: pickConcrete([fact.action, focus.action, profile.safeClaims[0], product.offer], product.name)
  };
}

function buildCuriosityAngle({ project, product, brief, productFact, hookIntelligence }) {
  const conflict = buildConflict({ project, product, brief, productFact, hookIntelligence });
  return {
    conflict,
    fact: productFact.fact,
    situation: productFact.situation,
    promise: hookIntelligence?.hookPromise || "зритель поймет конкретную деталь, которую легко проверить",
    question: buildQuestion(productFact)
  };
}

function buildFinalContent({ project, product, brief, productFact, curiosityAngle, layoutPlan }) {
  const headline = cleanHeadline(brief.hook, productFact, curiosityAngle);
  const subhead = cleanSentence(curiosityAngle.conflict);
  const points = pickLayoutPoints({ project, product, brief, productFact, curiosityAngle, layoutPlan });
  return {
    headline,
    subhead,
    points,
    disclaimer: "",
    layoutType: layoutPlan?.layoutType || "",
    curiosityAngle
  };
}

function pickLayoutPoints({ project, product, brief, productFact, curiosityAngle, layoutPlan }) {
  const base = isTravelContentProject(project, product)
    ? travelPoints(productFact)
    : isPaymentProject(project, product)
      ? paymentPoints(productFact)
      : everydayPoints(productFact, curiosityAngle);
  if (layoutPlan?.layoutType === "beauty-grid") return uniquePoints(beautyGridPoints(productFact));
  if (layoutPlan?.layoutType === "symptoms-poster") return uniquePoints(base).slice(0, 4);
  if (brief.format === "comparison" || layoutPlan?.layoutType === "fact-badges") return uniquePoints(comparisonPoints(productFact));
  return uniquePoints(base).slice(0, 5);
}

function travelPoints(fact) {
  return [
    `${fact.place}: ${fact.fact}`,
    `Ситуация: ${fact.situation}`,
    `До поездки: ${fact.action}`,
    "Сохраните правило для первого дня, а не для разбора после ошибки"
  ];
}

function paymentPoints(fact) {
  return [
    fact.situation,
    fact.fact,
    fact.action,
    "Статус и подтверждение важнее обещания сделать всё мгновенно"
  ];
}

function everydayPoints(fact, angle) {
  return [
    fact.situation,
    fact.fact,
    fact.action,
    angle.question
  ].filter(Boolean);
}

function beautyGridPoints(fact) {
  return [
    fact.situation,
    fact.fact,
    fact.action,
    "Один новый актив за вечер легче отследить, чем пять средств сразу"
  ];
}

function comparisonPoints(fact) {
  return [
    `Кажется: достаточно общего совета`,
    `На деле: ${fact.fact}`,
    `Проверьте: ${fact.action}`,
    `Риск: решить по красивой формулировке, а не по контексту`
  ];
}

function buildConflict({ project, product, brief, productFact, hookIntelligence }) {
  if (isTravelContentProject(project, product)) {
    return `${productFact.place}: маленькое правило может изменить впечатление от поездки`;
  }
  if (isPaymentProject(project, product)) {
    return `Проблема часто не в оплате, а в непроверенном сценарии: ${productFact.situation}`;
  }
  if (hookIntelligence?.hookType === "anti-advice") return `${productFact.situation}: сначала проверьте деталь, а не делайте вывод по впечатлению`;
  if (brief.format === "comparison") return `Красивое обещание спорит с проверяемой деталью`;
  return `${productFact.situation}: причина часто прячется в маленькой детали`;
}

function cleanHeadline(hook, productFact, angle) {
  const source = String(hook || "").replace(/\bn\b/gi, "5").replace(/\([^)]*\)/g, "").trim();
  if (isGoodHeadline(source)) return limitWords(source, 8);
  return limitWords(buildFallbackHeadline(productFact, angle), 8);
}

function buildQuestion(fact) {
  if (fact.place) return `Что проверить заранее: ${fact.action}`;
  return `Что проверить первым: ${fact.action}`;
}

function pickConcrete(items, productName) {
  const blocked = normalizeCuriosityText(productName);
  return items
    .flatMap((item) => String(item || "").split(/\n|;/))
    .map(cleanSentence)
    .find((item) => item && normalizeCuriosityText(item) !== blocked && !isVague(item))
    || "одна проверяемая деталь меняет итог";
}

function isGoodHeadline(value) {
  return value.length >= 12 && !/полезный разбор|давать всякие|интересные факты|рекомендации|5 моментов|5 вещей|причин проверить это заранее|проверить это заранее|красных флагов|вы узнаете это состояние/i.test(value);
}

function isVague(value) {
  return /без медицинских обещаний|без обещаний|делаем акцент|акцент на|не заменяет|упоминаем|показываем сценарии|поддержк[ау]$/i.test(value);
}

function buildFallbackHeadline(fact, angle) {
  const source = `${fact.situation} ${fact.fact} ${fact.action}`.toLowerCase();
  if (fact.place) return `${fact.place}: проверьте это заранее`;
  if (/пептид|сыворот|патч/.test(source)) return "Пептиды требуют спокойной проверки";
  if (/коллаген|витамин|тускл|ногт/.test(source)) return "Коллагену мешает нерегулярность";
  if (/сон|уснуть|вечер|магни/.test(source)) return "Сон ломает вечерняя мелочь";
  if (/карта|оплат|сервис|подписк|инвойс|счет/.test(source)) return "Карта отклонена не из-за суммы";
  return angle.question;
}

function uniquePoints(points) {
  const seen = new Set();
  return points.map(cleanSentence).filter((point) => {
    const key = normalizeCuriosityText(point);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function cleanSentence(value) {
  return String(value || "").replace(/\s+/g, " ").replace(/[.。]+$/g, "").trim();
}

function limitWords(value, max) {
  const words = cleanSentence(value).split(/\s+/).filter(Boolean);
  return words.length > max ? words.slice(0, max).join(" ") : words.join(" ");
}

function normalizeCuriosityText(value) {
  return String(value || "").toLowerCase().replace(/[^a-zа-я0-9ё]+/gi, " ").trim();
}

function hashText(value) {
  return String(value || "").split("").reduce((sum, char) => ((sum << 5) - sum) + char.charCodeAt(0), 0);
}
