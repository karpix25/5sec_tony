import { scenarioPatterns } from "./creative-patterns.js";
import { createContentLayer } from "./content-layers.js";
import { isPaymentProject } from "./project-content-intent.js";

const genericSlots = scenarioPatterns.map((pattern) => ({
  id: pattern.id,
  format: pattern.format,
  angle: pattern.planShape,
  topic: pattern.topic,
  hook: pattern.hook,
  visualObject: pattern.visualObject,
  meaningPatternId: pattern.id
}));

const paymentSlots = [
  {
    id: "card-rejected",
    lockTopic: true,
    format: "mistake-solution",
    angle: "карта снова не проходит",
    topic: "Почему зарубежный сервис снова отклоняет оплату",
    hook: "Карта не проходит? Вот где обычно ломается платеж",
    visualObject: "красный экран отказа, карта, тревожный значок и маршрут спасения доступа"
  },
  {
    id: "subscription-deadline",
    lockTopic: true,
    format: "checklist",
    angle: "доступ может отключиться сегодня",
    topic: "Что делать, если важная подписка вот-вот отключится",
    hook: "Подписка сгорит сегодня? Не ждите последний час",
    visualObject: "таймер, красная дата списания, выключенный доступ и карточка сервиса"
  },
  {
    id: "business-tools",
    lockTopic: true,
    format: "product-stack",
    angle: "работа встанет из-за оплаты",
    topic: "Что будет, если рабочий сервис отключится в самый неудобный момент",
    hook: "Один неоплаченный сервис может остановить всю работу",
    visualObject: "цепочка SaaS-сервисов, тревожный стоп-сигнал и рабочий стол команды"
  },
  {
    id: "travel-booking",
    lockTopic: true,
    format: "scheme",
    angle: "бронь может слететь",
    topic: "Почему зарубежная бронь может сорваться из-за оплаты",
    hook: "Бронь держат недолго: успейте проверить оплату",
    visualObject: "билет, отель, таймер удержания брони и тревожная карта поездки"
  },
  {
    id: "invoice-payment",
    lockTopic: true,
    format: "scheme",
    angle: "счет выглядит непонятно",
    topic: "Где прячутся риски в зарубежном счете перед оплатой",
    hook: "Счет из-за рубежа: не платите вслепую",
    visualObject: "крупный invoice с подсвеченными опасными полями, валюта и срок"
  },
  {
    id: "commission-terms",
    lockTopic: true,
    format: "checklist",
    angle: "скрытые условия перед оплатой",
    topic: "Что может неприятно всплыть после зарубежной оплаты",
    hook: "Сначала условия. Потом деньги",
    visualObject: "лист условий с яркими маркерами: сумма, срок, комиссия, ограничения"
  },
  {
    id: "support-route",
    lockTopic: true,
    format: "scheme",
    angle: "платеж завис и непонятно что дальше",
    topic: "Что происходит, когда зарубежный платеж зависает на уточнениях",
    hook: "Платеж завис? Главное — не потерять статус",
    visualObject: "чат поддержки, статус заявки, тревожные уведомления и прогресс"
  },
  {
    id: "safe-boundaries",
    lockTopic: true,
    format: "comparison",
    angle: "слишком сладкие обещания оплаты",
    topic: "Какие обещания в оплате зарубежных сервисов должны насторожить",
    hook: "Обещают оплатить что угодно? Это красный флаг",
    visualObject: "две колонки: прозрачная помощь против рискованных обещаний, знаки опасности"
  }
];

export function createContentSlot({ project, product, existingJobs = [] }) {
  const slots = pickContentSlots(project, product);
  const used = new Set(existingJobs.map((job) => job.semanticKey || classifyJob(job, slots)));
  const slot = slots.find((item) => !used.has(item.id)) || slots[existingJobs.length % slots.length];
  return enrichSlotWithLayer(slot, { project, product, existingJobs });
}

export function refreshContentSlotLayer(slot, { project, product, existingJobs = [] }) {
  if (slot?.lockTopic) return slot;
  const baseSlot = pickContentSlots(project, product).find((item) => item.id === slot?.id) || slot;
  return enrichSlotWithLayer(baseSlot, { project, product, existingJobs });
}

function pickContentSlots(project, product) {
  if (isPaymentProject(project, product)) return paymentSlots;
  return genericSlots;
}

export function createRecentJobDigest(existingJobs = []) {
  return existingJobs.slice(0, 30).map((job) => ({
    title: job.title || "",
    topic: job.topic || "",
    semanticKey: job.semanticKey || "",
    meaningPatternId: job.meaningPatternId || "",
    format: job.format || ""
  }));
}

function enrichSlotWithLayer(slot, { project, product, existingJobs }) {
  const contentLayer = createContentLayer({ project, product: product || getJobProductFallback(project), existingJobs });
  return {
    ...slot,
    contentLayer,
    angle: `${slot.angle}; ${contentLayer.label}`,
    topic: `${contentLayer.topic}. ${slot.topic}`,
    hook: contentLayer.hook
  };
}

function getJobProductFallback(project) {
  return {
    name: project.projectTheme || project.name || "продукт",
    offer: project.audienceDesires || project.projectTheme || "",
    pains: project.audiencePains || "",
    facts: project.companyInfo || ""
  };
}

function classifyJob(job, slots) {
  const text = normalizeRotationText(`${job.topic || ""} ${job.title || ""}`);
  const matched = slots.find((slot) => {
    const haystack = normalizeRotationText(`${slot.id} ${slot.angle} ${slot.topic} ${slot.hook}`);
    return haystack.split(" ").some((word) => word.length > 5 && text.includes(word));
  });
  return matched?.id || "";
}

function normalizeRotationText(value) {
  return String(value || "").toLowerCase().replace(/[^a-zа-я0-9ё]+/gi, " ").trim();
}
