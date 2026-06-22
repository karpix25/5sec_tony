import { createAutoGenerationBrief, createSemanticPlan } from "./generation.js";
import { buildProductProfile } from "./product-profile.js";
import { getProductContentFocus } from "./product-content-focus.js";
import { isPaymentProject } from "./project-content-intent.js";

export function createGenerationStrategy({ project, product, reference, generationBrief = {}, existingJobs = [], hookLibrary }) {
  const brief = createAutoGenerationBrief({ project, product, reference, generationBrief, existingJobs, hookLibrary });
  const semanticPlan = createSemanticPlan({ project, product, brief });
  const profile = buildProductProfile({ project, product, insightMap: brief.productInsightMap });
  const focus = getProductContentFocus({ project, product });
  const nicheFact = pickNicheFact({ project, product, brief, semanticPlan, profile, focus });
  const payment = isPaymentProject(project, product);
  return {
    projectId: project.id,
    productId: product.id,
    projectName: project.name,
    productName: product.name,
    topic: payment ? paymentTopics[brief.semanticKey] || brief.topic : brief.topic,
    hook: payment ? paymentHooks[brief.semanticKey] || brief.hook : brief.hook,
    format: brief.format,
    semanticKey: brief.semanticKey,
    nicheFact,
    productInsight: pickFirst([profile.primaryUseCase, focus.context, product.description]),
    productBridge: buildProductBridge({ product, nicheFact, semanticPlan }),
    visualObject: brief.visualObject,
    referenceTitle: reference?.title || "",
    points: semanticPlan.points || [],
    cta: semanticPlan.cta || brief.cta || product.name,
    disclaimer: semanticPlan.disclaimer || "",
    sourceBrief: {
      semanticKey: brief.semanticKey,
      contentLayerId: brief.contentLayerId || "",
      meaningPatternId: brief.meaningPatternId || "",
      productVisualMode: brief.productVisualMode || "",
      compositionMode: brief.compositionMode || ""
    }
  };
}

function pickNicheFact({ project, product, brief, semanticPlan, profile, focus }) {
  const paymentFact = isPaymentProject(project, product) ? paymentFacts[brief.semanticKey] : "";
  return pickFirst([
    paymentFact,
    cleanPoint(semanticPlan.points?.[0]),
    profile.primaryProof,
    focus.fact,
    product.description
  ]);
}

function buildProductBridge({ product, nicheFact, semanticPlan }) {
  const action = cleanPoint(semanticPlan.points?.at?.(-1));
  const offer = capitalize(product.offer || product.name);
  return pickFirst([
    action && `${action}. ${offer}`,
    `${nicheFact}. ${offer}`,
    product.description
  ]);
}

function pickFirst(items) {
  return items.map((item) => String(item || "").trim()).find(Boolean) || "";
}

function cleanPoint(value) {
  return String(value || "").replace(/^\d+[\).:-]?\s*/, "").trim();
}

function capitalize(value) {
  const text = String(value || "").trim();
  return text ? text[0].toUpperCase() + text.slice(1) : "";
}

const paymentTopics = {
  "card-rejected": "Почему зарубежный сервис отклоняет оплату, даже если с картой все нормально",
  "subscription-deadline": "Что происходит, когда важная подписка отключается в последний момент",
  "business-tools": "Как один неоплаченный сервис останавливает работу команды",
  "travel-booking": "Почему бронь или билет могут сорваться из-за одной задержки оплаты",
  "invoice-payment": "Где в зарубежном счете прячутся риски перед оплатой",
  "commission-terms": "Какие условия нужно зафиксировать до зарубежной оплаты",
  "support-route": "Почему статус заявки важнее обещания быстро оплатить",
  "safe-boundaries": "Какие обещания в оплате зарубежных сервисов должны насторожить"
};

const paymentHooks = {
  "card-rejected": "Карта не проходит? Проблема может быть не в карте",
  "subscription-deadline": "Подписка сгорит сегодня? Не ждите последний час",
  "business-tools": "Один неоплаченный сервис может остановить всю работу",
  "travel-booking": "Бронь держат недолго: оплату лучше проверить заранее",
  "invoice-payment": "Счет из-за рубежа: не платите вслепую",
  "commission-terms": "Сначала условия. Потом деньги",
  "support-route": "Платеж завис? Главное — не потерять статус",
  "safe-boundaries": "Обещают оплатить что угодно? Это красный флаг"
};

const paymentFacts = {
  "card-rejected": "Зарубежный платеж часто ломается не из-за карты, а из-за страны, типа платежа или правил самого сервиса",
  "subscription-deadline": "Подписка обычно отключается автоматически: команда замечает проблему уже в рабочий момент",
  "business-tools": "Один неоплаченный рабочий сервис может остановить файлы, рекламу, разработку или коммуникации команды",
  "travel-booking": "Бронь и билет держатся ограниченное время, поэтому сорванная оплата быстро превращается в потерю цены или места",
  "invoice-payment": "В зарубежном счете риск чаще спрятан в валюте, сроке, получателе и назначении платежа",
  "commission-terms": "Неприятные условия оплаты обычно всплывают после старта, если заранее не зафиксировать сумму, срок и комиссию",
  "support-route": "Когда платеж зависает, человеку важнее всего видеть статус заявки и следующий понятный шаг",
  "safe-boundaries": "Прозрачный сервис сначала называет рамки и ограничения, а не обещает оплатить что угодно"
};
