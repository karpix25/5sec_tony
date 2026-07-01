import { limitImagePrompt } from "./image-prompt-budget.js";
import { formatAvatarCornerCompositionPolicy } from "./image-composition-policy.js";
import { formatLayoutPlanPrompt } from "./layout-content-planner.js";
import { getProductVisualPromptPolicy } from "./product-visual-policy.js";

import { stringifyPromptContract } from "./prompt-contract.js";

export function buildCreativeTeamImagePrompt(brief = {}, { freePrompt, avatarReservedZonePrompt = "", currentDatePrompt = "", promptContract = null } = {}) {
  const packagePrompt = brief.imagePromptPackage?.prompt || "";
  if (!packagePrompt) return "";
  const productVisualMode = brief.productVisibilityDecision?.productVisualMode || brief.productVisualMode || getCreativeTeamProductVisualMode(brief);
  const content = normalizeCreativePromptContent(brief.contentScript || brief.finalContent || brief.aiPlan || {}, {
    productVisualMode,
    productPassport: brief.productPassport
  });
  const safePromptContract = promptContract ? sanitizePromptContract(promptContract, content) : null;
  const format = brief.designFormatBrief || {};
  const formatType = getEffectiveFormatType({ brief, format });
  const safePackagePrompt = sanitizePackagePrompt(packagePrompt, { formatType, productVisualMode, productPassport: brief.productPassport });
  const productVisualContract = getProductVisualPromptPolicy(productVisualMode);
  const cornerCompositionPolicy = formatAvatarCornerCompositionPolicy({ productVisualMode });
  return limitImagePrompt([
    safePackagePrompt,
    safePromptContract ? `JSON-КОНТРАКТ ПРОМПТА:\n${stringifyPromptContract(safePromptContract)}` : "",
    "ТЕХНИЧЕСКИЕ ПРАВИЛА РЕНДЕРА:",
    currentDatePrompt,
    productVisualContract,
    avatarReservedZonePrompt,
    cornerCompositionPolicy,
    "ФИНАЛЬНЫЙ ТЕКСТОВЫЙ КОНТРАКТ: не менять тему и видимые формулировки, уже сгенерированные AI-командой.",
    content.headline ? `Заголовок: ${content.headline}.` : "",
    content.subhead ? `Подзаголовок: ${content.subhead}.` : "",
    Array.isArray(content.points) && content.points.length ? `Блоки: ${content.points.map(formatContentPoint).join(" | ")}.` : "",
    freePrompt ? `Дополнительная задача оператора: ${String(freePrompt).trim().slice(0, 600)}.` : ""
  ].filter(Boolean).join(" "));
}

function sanitizePromptContract(contract, content) {
  return {
    ...contract,
    textContract: {
      ...(contract.textContract || {}),
      headline: content.headline || "",
      subhead: content.subhead || "",
      points: Array.isArray(content.points) ? content.points : [],
      cta: "",
      disclaimer: ""
    }
  };
}

function getFormatLock(formatType = "") {
  if (formatType !== "ranking_leaderboard") return "";
  return "ОБЯЗАТЕЛЬНАЯ ФИКСАЦИЯ ФОРМАТА: сохранить структуру рейтингового top-chart из дизайн-референса: плотный постер, крупная заголовочная зона, служебная строка/легенда, повторяемые высокие вертикальные ранговые колонки или карточки, номера мест, короткие подписи значений, светящиеся рамки/разделители. Итоговый макет выглядит как вертикальный рейтинговый постер с постерной плотностью.";
}

function getTextContractRule(formatType = "") {
  if (formatType !== "ranking_leaderboard") {
    return "ФИНАЛЬНЫЙ ТЕКСТОВЫЙ КОНТРАКТ: не менять тему и видимые формулировки.";
  }
  return "ФИНАЛЬНЫЙ ТЕКСТОВЫЙ КОНТРАКТ ДЛЯ TOP-CHART: сохранить тему и смысл, но адаптировать видимый текст под рейтинговую структуру; не копировать формулировки чеклиста дословно, если они ломают количество и форму ранговых карточек.";
}

function getReferenceTraceContract(formatType = "") {
  if (formatType !== "ranking_leaderboard") return "";
  return [
    "КОНТРАКТ СЛЕДОВАНИЯ РЕФЕРЕНСУ: финальное изображение является узнаваемой адаптацией приложенного top-chart референса.",
    "Повтори геометрию: темный насыщенный фон, крупный верхний блок заголовка, маленькая строка источника/легенды под заголовком, сетка из многих высоких вертикальных рейтинговых колонок, светящиеся контуры, контраст золота, белого и синего, нижний ряд компактных мини-карточек.",
    "Меняется смысл, подписи и объекты под новый продукт; структура остается top-chart: темная постерная основа, вертикальные рейтинговые колонки, компактные ранговые карточки и светящиеся разделители.",
    "Палитра остается в логике темного chart-референса даже для wellness, воды, трав или косметики.",
    "Если контента меньше чем слотов в референсе, заполни 8-12 ранговых карточек короткими безопасными признаками/критериями.",
    "Палитра дизайн-референса ведет кадр: для темно-синего, золотого и голубого референса сохраняется темный chart-постер."
  ].join(" ");
}

function getRankingAdaptationContract(formatType = "", content = {}) {
  if (formatType !== "ranking_leaderboard") return "";
  const count = Array.isArray(content.points) ? content.points.length : 0;
  return [
    "ПЛАН АДАПТАЦИИ ПОД РЕЙТИНГ: если исходный сценарий похож на чеклист, диагностическую карточку или содержит 4-6 пунктов, использовать его как сырье для top-chart структуры.",
    "Перепаковать тему в ТОП 10 или ТОП 12 chart: крупный заголовок начинается с ТОП, подзаголовок/легенда совпадает с числом ранговых карточек.",
    "Каждый рейтинговый элемент является высокой вертикальной карточкой/колонкой с компактной подписью.",
    count && count < 8 ? `Исходных пунктов ${count}; это сырье для смысла. Финальный макет должен иметь 8-12 коротких ранговых карточек.` : "",
    "Leaderboard держит главный визуальный вес через ранговые карточки, числа, светящиеся разделители и постерную иерархию; продуктовый сигнал остается компактным."
  ].filter(Boolean).join(" ");
}

function getRankingProductDominanceContract(formatType = "", brief = {}) {
  if (formatType !== "ranking_leaderboard" || isDirectProductVisualTopic(brief)) return "";
  return [
    "ПЛАН РОЛИ ПРОДУКТА: эта картинка работает как самостоятельный top-chart постер.",
    "ПЛАН ЦВЕТА: палитра дизайн-референса ведет кадр: темный синий фон, золотые акценты заголовка, голубое свечение и контуры.",
    "Главный визуальный хук: рейтинг, контраст, символы критериев, светящиеся карточки, числа и постерная иерархия.",
    "Связь с продуктом остается мягким смысловым мостом внутри темы."
  ].join(" ");
}

function formatGrammarLine(label, value, formatType = "") {
  if (!value) return "";
  const text = Array.isArray(value) ? value.join(", ") : String(value);
  if (formatType === "ranking_leaderboard" && /green|зелен|product|wellness/i.test(text)) {
    return `${label}: темно-синяя база, золотые акценты, белый текст, голубое свечение и контуры.`;
  }
  return `${label}: ${text}.`;
}

function sanitizePackagePrompt(prompt = "", { formatType, productVisualMode, productPassport } = {}) {
  return sanitizePackagePromptLines(prompt, productPassport, {
    removeProduct: productVisualMode === "no-package" || formatType === "ranking_leaderboard"
  });
}

function sanitizePackagePromptLines(prompt = "", productPassport = {}, { removeProduct = false } = {}) {
  const productName = productPassport?.productName || productPassport?.name || "";
  const terms = String(productName).split(/\s+|\+/).filter((item) => item.length >= 4);
  const productPattern = terms.length ? new RegExp(terms.map(escapeCreativeRegExp).join("|"), "i") : null;
  const safeLines = String(prompt)
    .split(/(?<=[.!?])\s+|\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !isDisclaimerCreativeLine(line))
    .filter((line) => !removeProduct || !productPattern?.test(line))
    .filter((line) => !removeProduct || !/sonre|chlorophyll|хлорофилл|флакон|бутыл|банка|упаков|packshot|bottle|package|стакан|энерг|бодрост|вынослив|иммун|гидратац|баланс|detox|детокс|поможет|вернет|восстанов/i.test(line));
  return safeLines.join(" ");
}

function formatContentPoint(point) {
  if (!point || typeof point !== "object") return String(point || "");
  return [point.rank, point.title, point.label, point.text, point.caption]
    .filter(Boolean)
    .join(": ");
}

function normalizeCreativePromptContent(content = {}, { productVisualMode, productPassport } = {}) {
  const headline = cleanCreativeContentLine(content.headline, { productVisualMode, productPassport });
  const points = Array.isArray(content.points)
    ? content.points.map((point) => cleanCreativeContentLine(formatContentPoint(point), { productVisualMode, productPassport })).filter(Boolean)
    : [];
  const rawSubhead = cleanCreativeContentLine(content.subhead, { productVisualMode, productPassport });
  const subhead = isDuplicateCreativeLine(rawSubhead, headline)
    ? points.find((point) => !isDuplicateCreativeLine(point, headline)) || ""
    : rawSubhead;
  return { ...content, headline, subhead, points };
}

function cleanCreativeContentLine(value, { productVisualMode, productPassport } = {}) {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  if (isDisclaimerCreativeLine(clean)) return "";
  if (productVisualMode !== "no-package") return clean;
  const productName = productPassport?.productName || productPassport?.name || "";
  const terms = String(productName).split(/\s+|\+/).filter((item) => item.length >= 4);
  const productPattern = terms.length ? new RegExp(terms.map(escapeCreativeRegExp).join("|"), "gi") : null;
  const withoutProduct = productPattern ? clean.replace(productPattern, "").replace(/\s{2,}/g, " ").trim() : clean;
  if (/упаков|этикет|флакон|бутыл|баноч|банка|sku|packshot|bottle|package|label|jar/i.test(withoutProduct)) return "";
  return withoutProduct.replace(/\b[A-Z]{3,}\b/g, "").replace(/\s{2,}/g, " ").trim();
}

function isDisclaimerCreativeLine(value = "") {
  return /не является\s+(?:лекар|медицинск)|лекарственным\s+средством|не\s+лечит|бад\.?|биологически\s+активн|есть\s+противопоказан|проконсультируйтесь|консультац[а-я\s]+врач|информация\s+не\s+заменяет|не\s+заменяет\s+консультац/i.test(String(value));
}

function isDuplicateCreativeLine(value, other) {
  const left = normalizeCreativeLine(value);
  const right = normalizeCreativeLine(other);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

function normalizeCreativeLine(value) {
  return String(value || "").toLowerCase().replace(/ё/g, "е").replace(/[^а-яa-z0-9]+/g, " ").trim();
}

function escapeCreativeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getEffectiveFormatType({ brief = {}, format = {} }) {
  const signals = [brief.format, brief.layoutContentPlan?.layoutType, format.formatType].filter(Boolean);
  return signals.includes("ranking_leaderboard") ? "ranking_leaderboard" : signals[0] || "";
}

export function getCreativeTeamProductVisualMode(brief = {}) {
  const formatType = getEffectiveFormatType({ brief, format: brief.designFormatBrief || {} });
  if (formatType === "ranking_leaderboard" && !isDirectProductVisualTopic(brief)) return "no-package";
  const usage = brief.visualBrief?.productUsage || "";
  if (usage === "exact_product") return "exact-product";
  if (usage === "small_signal" || usage === "do_not_show") return "no-package";
  return "";
}

function isDirectProductVisualTopic(brief = {}) {
  const content = brief.contentScript || brief.finalContent || brief.aiPlan || {};
  const source = [
    brief.topic,
    brief.hook,
    brief.creativeBrief?.topic,
    brief.creativeBrief?.coreIdea,
    content.headline,
    content.subhead
  ].filter(Boolean).join(" ").toLowerCase();
  return /упаков|этикет|состав|что внутри|обзор продукт|выбор продукт|как пить|как приним|дозиров|флакон|бутылк|банк/.test(source);
}
