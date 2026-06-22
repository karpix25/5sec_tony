import { buildProductProfile } from "./product-profile.js";
import { normalizeHookPhrase } from "./hook-phrase-normalizer.js";

export function createHookProductBridge({ hookReference, adaptedHook, project, product, angle }) {
  if (!hookReference || !adaptedHook) return null;
  const profile = buildProductProfile({ project, product });
  const shape = classifyHookBridgeShape(hookReference.text || adaptedHook);
  const context = createBridgeContext({ profile, project, product, angle });
  const topic = buildBridgeTopic(shape, context);

  return {
    topic,
    aiPlan: {
      headline: "",
      subhead: buildBridgeSubhead(shape, context),
      points: buildBridgePoints(shape, context),
      disclaimer: "",
      hookPsychology: buildBridgePsychology({ hookReference, shape, context })
    },
    notes: `Hook Product Bridge: ${shape}. Хук адаптирован через продуктовый сценарий, без механической подстановки названия продукта.`
  };
}

function createBridgeContext({ profile, project, product, angle }) {
  const productName = product?.name || "";
  const pain = bridgeFirst([
    angle,
    profile.primaryPain,
    profile.primaryUseCase,
    profile.primaryProof,
    product?.offer,
    project?.projectTheme
  ], productName);
  const useCase = bridgeFirst([
    profile.primaryUseCase,
    pain,
    product?.offer,
    profile.primaryProof,
    project?.projectTheme
  ], productName);
  const proof = bridgeFirst([
    profile.primaryProof,
    product?.description,
    product?.offer,
    project?.companyInfo
  ], productName);
  const step = bridgeFirst([
    product?.offer,
    profile.safeClaims?.[0],
    profile.primaryProof,
    useCase
  ], productName);

  return {
    pain: bridgeShort(pain),
    useCase: bridgeShort(useCase),
    proof: bridgeShort(proof),
    step: bridgeShort(step),
    category: bridgeShort(project?.projectTheme || product?.description || useCase)
  };
}

function classifyHookBridgeShape(value) {
  const source = String(value || "").toLowerCase();
  if (/красн|флаг|опасн|риск/.test(source)) return "red-flag";
  if (/ошиб|стоить|лома|не делайте/.test(source)) return "mistake";
  if (/миф|правд|реальн|норма/.test(source)) return "myth-reality";
  if (/проверь|чек|пункт|признак|вещ/.test(source)) return "checklist";
  if (/почему|зачем|что будет/.test(source)) return "curiosity";
  return "useful-angle";
}

function buildBridgeTopic(shape, context) {
  const byShape = {
    "red-flag": `Как отличить нормальную ситуацию от тревожного сигнала: ${context.pain}`,
    mistake: `Какая ошибка мешает получить пользу: ${context.pain}`,
    "myth-reality": `Какой миф мешает понять ситуацию: ${context.pain}`,
    checklist: `Что проверить заранее: ${context.useCase}`,
    curiosity: `Почему это происходит: ${context.pain}`,
    "useful-angle": `Полезный разбор: ${context.useCase}`
  };
  return byShape[shape] || byShape["useful-angle"];
}

function buildBridgeSubhead(shape, context) {
  const byShape = {
    "red-flag": "Покажите зрителю, какой сигнал стоит заметить до решения.",
    mistake: "Ошибка должна быть конкретной: что человек делает и почему результат ломается.",
    "myth-reality": "Сначала разрушьте привычное объяснение, потом дайте проверяемый факт.",
    checklist: "Карточка должна работать как короткая проверка перед действием.",
    curiosity: "Откройте причину знакомой ситуации без рекламного давления.",
    "useful-angle": "Дайте самостоятельную пользу, а продукт оставьте мягким контекстом."
  };
  return byShape[shape] || `${context.category}: полезно сохранить перед решением.`;
}

function buildBridgePoints(shape, context) {
  const firstPoint = {
    "red-flag": `Сигнал: ${context.pain}`,
    mistake: `Ошибка: ${context.pain}`,
    "myth-reality": `Миф: все решается одним советом`,
    checklist: `Проверьте: ${context.useCase}`,
    curiosity: `Причина: ${context.proof}`,
    "useful-angle": `Ситуация: ${context.useCase}`
  }[shape] || `Ситуация: ${context.useCase}`;

  return [
    firstPoint,
    `Контекст: ${context.useCase}`,
    `Факт: ${context.proof}`,
    `Полезный шаг: ${context.step}`
  ];
}

function buildBridgePsychology({ hookReference, shape, context }) {
  return [
    `Форма хука из библиотеки: ${hookReference.text}.`,
    `Психологический угол: ${shape}.`,
    `Сценарий продукта: ${context.useCase}.`,
    `Проверяемый факт: ${context.proof}.`,
    "Не вставляй название продукта механически в заголовок; сначала совмести хук с болью, фактом и полезным сценарием."
  ].join(" ");
}

function bridgeFirst(items, productName = "") {
  const blocked = normalizeBridgeValue(productName);
  return items
    .flatMap((item) => String(item || "").split(/\n|;|,/))
    .map((item) => normalizeHookPhrase(item))
    .find((item) => item && normalizeBridgeValue(item) !== blocked) || "";
}

function bridgeShort(value) {
  return normalizeHookPhrase(value).slice(0, 90).replace(/[:.!?]+$/g, "");
}

function normalizeBridgeValue(value) {
  return String(value || "").toLowerCase().replace(/[^a-zа-я0-9ё]+/gi, " ").trim();
}
