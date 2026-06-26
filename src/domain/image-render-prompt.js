import { formatCurrentDatePrompt } from "./current-date-context.js";

export function buildImageRenderPrompt({ strategy, card, reference }) {
  return [
    "Create a vertical 9:16 Russian fintech infographic for a social video cover.",
    formatCurrentDatePrompt(),
    "",
    "Visible text:",
    `Top hook: ${card.headline}`,
    `Main thesis: ${card.subhead}`,
    ...card.points.map((point, index) => `Point ${index + 1}: ${point}`),
    card.footer ? `Footer: ${card.footer}` : "",
    "",
    `Product context: ${strategy.productName}. ${strategy.productBridge}`,
    `Visual idea: ${strategy.visualObject}`,
    `Layout: ${card.layout}`,
    referenceInstruction(reference),
    "",
    "Create only the final image: a clear poster with strong hierarchy, readable Russian text, and comfortable margins.",
    "Avoid bank logos, payment system logos, gray schemes, sanctions bypass promises, and guaranteed payment claims."
  ].filter(Boolean).join("\n");
}

function referenceInstruction(reference) {
  if (!reference) return "";
  const parts = [
    reference.title ? `Use design reference mood: ${reference.title}.` : "",
    reference.palette ? `Palette: ${reference.palette}.` : "",
    reference.headlineStyle ? `Headline style: ${reference.headlineStyle}.` : "",
    reference.takeaways ? `Design cues only: ${cleanReferenceText(reference.takeaways)}` : ""
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
