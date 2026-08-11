import { formatCurrentDatePrompt } from "./current-date-context.js";
import { getImagePromptProductTextRules } from "./language-policy.js";

export function buildImageRenderPrompt({ strategy, card, reference, productVisualMode = "", shouldPassProductRefs } = {}) {
  return [
    "Создай вертикальную 9:16 инфографику на русском языке для обложки социального видео.",
    "ЖЕСТКОЕ ПРАВИЛО: весь редакционный текст инфографики — это добавляемый редакционный текст, подписи и служебные элементы; он должен быть только на русском. Не писать английские служебные подписи, интерфейсные ярлыки, заглушки или псевдолатинский текст.",
    ...getImagePromptProductTextRules({ productVisualMode, shouldPassProductRefs }),
    formatCurrentDatePrompt(),
    "",
    "Видимый текст:",
    `Верхний хук: ${card.headline}`,
    `Главный тезис: ${card.subhead}`,
    ...card.points.map((point, index) => `Пункт ${index + 1}: ${point}`),
    card.footer ? `Нижняя подпись: ${card.footer}` : "",
    "",
    `Контекст продукта: ${strategy.productName}. ${strategy.productBridge}`,
    `Визуальная идея: ${strategy.visualObject}`,
    `Макет: ${card.layout}`,
    referenceInstruction(reference),
    "",
    "Создай только финальную картинку: понятный постер с сильной иерархией, читаемым русским текстом и комфортными полями.",
    "Не использовать логотипы банков и платежных систем, серые схемы, обещания обхода санкций и гарантированные платежные claims."
  ].filter(Boolean).join("\n");
}

function referenceInstruction(reference) {
  if (!reference) return "";
  const parts = [
    reference.title ? `Настроение дизайн-референса: ${reference.title}.` : "",
    reference.palette ? `Палитра: ${reference.palette}.` : "",
    reference.headlineStyle ? `Стиль заголовка: ${reference.headlineStyle}.` : "",
    reference.takeaways ? `Только дизайн-подсказки: ${cleanReferenceText(reference.takeaways)}` : ""
  ].filter(Boolean);
  return parts.join(" ");
}

function cleanReferenceText(value) {
  return String(value || "")
    .replace(/\bsafe\s*zone\b/gi, "comfortable margins")
    .replace(/координат[а-яё\s\d.,:-]*/gi, "")
    .replace(/backend|json|internal scoring|implementation terms/gi, "")
    .replace(/нижнюю часть не перегружать для будущего видео-оверлея\.?/gi, "нижнюю часть оставить спокойной.")
    .replace(/\s+/g, " ")
    .trim();
}
