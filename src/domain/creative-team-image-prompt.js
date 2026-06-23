import { limitImagePrompt } from "./image-prompt-budget.js";

export function buildCreativeTeamImagePrompt(brief = {}, { freePrompt } = {}) {
  const packagePrompt = brief.imagePromptPackage?.prompt || "";
  if (!packagePrompt) return "";
  const content = brief.contentScript || brief.finalContent || brief.aiPlan || {};
  const visual = brief.visualBrief || {};
  const format = brief.designFormatBrief || {};
  const slots = Array.isArray(format.layoutSlots) ? format.layoutSlots : [];
  const grammar = format.visualGrammar || {};
  return limitImagePrompt([
    packagePrompt,
    "ФИНАЛЬНЫЙ ТЕКСТОВЫЙ КОНТРАКТ: не менять тему и видимые формулировки.",
    getFormatLock(format),
    content.headline ? `Заголовок: ${content.headline}.` : "",
    content.subhead ? `Подзаголовок: ${content.subhead}.` : "",
    Array.isArray(content.points) && content.points.length ? `Блоки: ${content.points.join(" | ")}.` : "",
    format.formatType ? `ФОРМАТ РЕФЕРЕНСА: ${format.formatType}${format.structureName ? `, ${format.structureName}` : ""}.` : "",
    slots.length ? `Слоты макета: ${slots.map((slot) => `${slot.id || slot.role}:${slot.role}/${slot.textCapacity}`).join(" | ")}.` : "",
    grammar.composition ? `Композиция референса: ${grammar.composition}.` : "",
    grammar.hierarchy ? `Иерархия референса: ${grammar.hierarchy}.` : "",
    grammar.framesAndDividers ? `Рамки и разделители: ${grammar.framesAndDividers}.` : "",
    visual.productUsage ? `Использование продукта: ${visual.productUsage}.` : "",
    visual.negativeVisuals?.length ? `Не показывать: ${visual.negativeVisuals.join("; ")}.` : "",
    freePrompt ? `Дополнительная задача оператора: ${String(freePrompt).trim().slice(0, 600)}.` : ""
  ].filter(Boolean).join(" "));
}

function getFormatLock(format = {}) {
  if (format.formatType !== "ranking_leaderboard") return "";
  return "ОБЯЗАТЕЛЬНЫЙ FORMAT LOCK: сохранить leaderboard/top-chart skeleton из дизайн-референса: плотный постер, крупная заголовочная зона, служебная строка/легенда, повторяемые ранговые колонки или rank cards, номера мест, короткие value labels, светящиеся рамки/разделители. Не превращать в минималистичный белый checklist, обычный список с иконками или product flat lay.";
}

export function getCreativeTeamProductVisualMode(brief = {}) {
  const usage = brief.visualBrief?.productUsage || "";
  if (usage === "exact_product") return "exact-product";
  if (usage === "small_signal" || usage === "do_not_show") return "no-package";
  return "";
}
