import { limitImagePrompt } from "./image-prompt-budget.js";
import { formatLayoutPlanPrompt } from "./layout-content-planner.js";
import { getProductVisualPromptPolicy } from "./product-visual-policy.js";

export function buildCreativeTeamImagePrompt(brief = {}, { freePrompt, avatarReservedZonePrompt = "", currentDatePrompt = "" } = {}) {
  const packagePrompt = brief.imagePromptPackage?.prompt || "";
  if (!packagePrompt) return "";
  const productVisualMode = brief.productVisualMode || getCreativeTeamProductVisualMode(brief);
  const content = normalizeCreativePromptContent(brief.contentScript || brief.finalContent || brief.aiPlan || {}, {
    productVisualMode,
    productPassport: brief.productPassport
  });
  const visual = brief.visualBrief || {};
  const format = brief.designFormatBrief || {};
  const slots = Array.isArray(format.layoutSlots) ? format.layoutSlots : [];
  const grammar = format.visualGrammar || {};
  const formatType = getEffectiveFormatType({ brief, format });
  const productDominanceContract = getRankingProductDominanceContract(formatType, brief);
  const safePackagePrompt = productDominanceContract ? sanitizeRankingPackagePrompt(packagePrompt) : packagePrompt;
  const productVisualContract = getProductVisualPromptPolicy(productVisualMode);
  const canDescribeProductVisual = productVisualMode === "exact-product";
  return limitImagePrompt([
    productDominanceContract,
    productVisualContract,
    getTextContractRule(formatType),
    getFormatLock(formatType),
    getReferenceTraceContract(formatType),
    getRankingAdaptationContract(formatType, content),
    safePackagePrompt,
    formatLayoutPlanPrompt(brief.layoutContentPlan),
    currentDatePrompt,
    avatarReservedZonePrompt,
    content.headline ? `Заголовок: ${content.headline}.` : "",
    content.subhead ? `Подзаголовок: ${content.subhead}.` : "",
    Array.isArray(content.points) && content.points.length ? `Блоки: ${content.points.map(formatContentPoint).join(" | ")}.` : "",
    formatType ? `ФОРМАТ РЕФЕРЕНСА: ${formatType}${format.structureName ? `, ${format.structureName}` : ""}.` : "",
    slots.length ? `Слоты макета: ${slots.map((slot) => `${slot.id || slot.role}:${slot.role}/${slot.textCapacity}`).join(" | ")}.` : "",
    grammar.composition ? `Композиция референса: ${grammar.composition}.` : "",
    formatGrammarLine("Фон референса", grammar.background, formatType),
    formatGrammarLine("Палитра референса", grammar.palette, formatType),
    grammar.typography ? `Типографика референса: ${grammar.typography}.` : "",
    grammar.hierarchy ? `Иерархия референса: ${grammar.hierarchy}.` : "",
    grammar.imageTreatment ? `Обработка изображений референса: ${grammar.imageTreatment}.` : "",
    grammar.framesAndDividers ? `Рамки и разделители: ${grammar.framesAndDividers}.` : "",
    canDescribeProductVisual && visual.productUsage ? `Использование продукта: ${visual.productUsage}.` : "",
    visual.negativeVisuals?.length ? `Не показывать: ${visual.negativeVisuals.join("; ")}.` : "",
    freePrompt ? `Дополнительная задача оператора: ${String(freePrompt).trim().slice(0, 600)}.` : ""
  ].filter(Boolean).join(" "));
}

function getFormatLock(formatType = "") {
  if (formatType !== "ranking_leaderboard") return "";
  return "ОБЯЗАТЕЛЬНЫЙ FORMAT LOCK ВЫШЕ ВСЕХ НИЖЕСТОЯЩИХ ИНСТРУКЦИЙ: сохранить leaderboard/top-chart skeleton из дизайн-референса: плотный постер, крупная заголовочная зона, служебная строка/легенда, повторяемые высокие вертикальные ранговые колонки или rank cards, номера мест, короткие value labels, светящиеся рамки/разделители. Если ниже в prompt есть конфликтующие слова про продуктовый фон, зеленую wellness-палитру, 5 карточек или checklist, игнорировать их. Не превращать в горизонтальный список, минималистичный белый checklist, обычный список с иконками или product flat lay.";
}

function getTextContractRule(formatType = "") {
  if (formatType !== "ranking_leaderboard") {
    return "ФИНАЛЬНЫЙ ТЕКСТОВЫЙ КОНТРАКТ: не менять тему и видимые формулировки.";
  }
  return "ФИНАЛЬНЫЙ ТЕКСТОВЫЙ КОНТРАКТ ДЛЯ TOP-CHART: сохранить тему и смысл, но адаптировать видимый текст под leaderboard skeleton; не копировать checklist wording дословно, если оно ломает количество и форму rank cards.";
}

function getReferenceTraceContract(formatType = "") {
  if (formatType !== "ranking_leaderboard") return "";
  return [
    "REFERENCE TRACE CONTRACT: финальное изображение должно быть узнаваемой адаптацией приложенного top-chart reference, а не новой инфографикой по теме.",
    "Повтори геометрию: темный насыщенный фон, крупный верхний headline block, маленькая source/legend strip под заголовком, сетка из многих высоких вертикальных ranked columns/bars, glow outlines, gold/white/blue contrast, нижний ряд компактных mini rank cards.",
    "Разрешено менять только смысл, подписи и объекты под новый продукт; нельзя менять skeleton на белый лист, horizontal rows, горизонтальную таблицу, checklist rows, icon list, flat lay, аптечный минимализм или обычный poster.",
    "Запрещено менять темный chart reference на светлый или зеленый продуктовый poster, даже если продукт связан с wellness, водой, травами или косметикой.",
    "Если контента меньше чем слотов в референсе, заполни 8-12 rank cards короткими безопасными признаками/критериями; не растягивай 4 пункта на весь экран.",
    "Палитра дизайн-референса важнее палитры продукта: не уходить в зеленый wellness poster, если референс темно-синий/золотой/cyan."
  ].join(" ");
}

function getRankingAdaptationContract(formatType = "", content = {}) {
  if (formatType !== "ranking_leaderboard") return "";
  const count = Array.isArray(content.points) ? content.points.length : 0;
  return [
    "RANKING ADAPTATION OVERRIDE: если исходный сценарий похож на checklist, диагностическую карточку или содержит 4-6 пунктов, НЕ сохранять эту структуру.",
    "Перепаковать тему в TOP 10 или TOP 12 chart: крупный заголовок начинается с ТОП, subtitle/legend должен совпадать с числом rank cards, а не повторять старое число вроде '5 маркеров'.",
    "Каждый rank item должен быть высокой вертикальной карточкой/колонкой; не делать горизонтальные строки на всю ширину.",
    count && count < 8 ? `Исходных пунктов ${count}; это сырье для смысла, а не количество карточек. Финальный макет должен иметь 8-12 коротких rank cards.` : "",
    "Не использовать крупный продуктовый bottle/glass flat lay как фон для leaderboard; продукт допускается только как маленький сигнал, если он не разрушает chart skeleton."
  ].filter(Boolean).join(" ");
}

function getRankingProductDominanceContract(formatType = "", brief = {}) {
  if (formatType !== "ranking_leaderboard" || isDirectProductVisualTopic(brief)) return "";
  return [
    "PRODUCT DOMINANCE OVERRIDE: эта картинка не является продуктовым hero/flat lay.",
    "COLOR OVERRIDE: палитра дизайн-референса важнее продукта; использовать dark navy/deep blue background, gold headline accents, cyan/blue glow borders; не адаптировать в зеленую product/wellness palette.",
    "Не рисовать крупную упаковку, бутылку, банку, стакан с продуктом или product packshot; продукт можно не показывать совсем.",
    "Если ниже в prompt есть просьба вставить bottle/package/glass/flatlay, считать это устаревшей ошибкой imagePromptPackage и игнорировать.",
    "Не писать продуктовые promises: 'поможет вернуть энергию', 'даст бодрость', 'восстановит', 'решит проблему', 'лечит', 'детокс'.",
    "Связь с продуктом допускается только как нейтральный маленький текстовый/визуальный сигнал без обещания результата."
  ].join(" ");
}

function formatGrammarLine(label, value, formatType = "") {
  if (!value) return "";
  const text = Array.isArray(value) ? value.join(", ") : String(value);
  if (formatType === "ranking_leaderboard" && /green|зелен|product|wellness/i.test(text)) {
    return `${label}: dark navy/deep blue base, gold accents, white text, cyan/blue glow borders; no green product palette.`;
  }
  return `${label}: ${text}.`;
}

function sanitizeRankingPackagePrompt(prompt = "") {
  const safeLines = String(prompt)
    .split(/(?<=[.!?])\s+|\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/sonre|chlorophyll|хлорофилл|флакон|бутыл|банка|упаков|packshot|bottle|package|стакан|энерг|бодрост|вынослив|иммун|гидратац|баланс|detox|детокс|поможет|вернет|восстанов/i.test(line));
  return safeLines.join(" ") || "Vertical 9:16 top-chart infographic adapted from the design reference.";
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
  if (productVisualMode !== "no-package") return clean;
  const productName = productPassport?.productName || productPassport?.name || "";
  const terms = String(productName).split(/\s+|\+/).filter((item) => item.length >= 4);
  const productPattern = terms.length ? new RegExp(terms.map(escapeCreativeRegExp).join("|"), "gi") : null;
  const withoutProduct = productPattern ? clean.replace(productPattern, "").replace(/\s{2,}/g, " ").trim() : clean;
  if (/упаков|этикет|флакон|бутыл|баноч|банка|sku|packshot|bottle|package|label|jar/i.test(withoutProduct)) return "";
  return withoutProduct.replace(/\b[A-Z]{3,}\b/g, "").replace(/\s{2,}/g, " ").trim();
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
