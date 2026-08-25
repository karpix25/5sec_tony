import { getVisibleTextContractViolations } from "./design-text-contract.js";

export const ATTENTION_FRAMES = Object.freeze([
  "recognition",
  "diagnostic",
  "contrast",
  "loss",
  "mechanism",
  "fomo"
]);

const frameRules = Object.freeze({
  recognition: "Опирайся на узнаваемую бытовую ситуацию: зритель должен сразу узнать себя.",
  diagnostic: "Дай быструю проверку или признак, который можно мысленно сверить с собой.",
  contrast: "Покажи конфликт ожидания и реальности: кажется одно, но влияет другое.",
  loss: "Подсвети конкретную ошибку или потерю времени, денег, комфорта или результата.",
  mechanism: "Объясни простой механизм без терминов: что именно происходит и почему.",
  fomo: "Покажи, что зритель может поздно заметить важную деталь; без искусственной срочности и давления."
});

export function selectAttentionFrame({ recentFrames = [], existingJobs = [] } = {}) {
  const history = [...recentFrames, ...existingJobs.map((job) => job?.attentionFrame)]
    .map(normalizeFrame)
    .filter(Boolean)
    .slice(0, 8);
  const counts = new Map(ATTENTION_FRAMES.map((frame) => [frame, 0]));
  history.forEach((frame) => counts.set(frame, counts.get(frame) + 1));
  return ATTENTION_FRAMES
    .map((frame, index) => ({ frame, count: counts.get(frame), index }))
    .sort((left, right) => left.count - right.count || left.index - right.index)[0].frame;
}

export function attentionFrameInstruction(frame) {
  const normalized = normalizeFrame(frame) || "recognition";
  return `ATTENTION FRAME: ${normalized}. ${frameRules[normalized]} Это смысловой угол, а не шаблон первой фразы. Не начинай каждый заголовок с «почему»: форма должна соответствовать ситуации.`;
}

export function getAttentionFrameRule(frame) {
  return frameRules[normalizeFrame(frame) || "recognition"];
}

export function validateHeadlineSafety(headline) {
  const text = String(headline || "").replace(/\s+/g, " ").trim();
  const words = text.split(/\s+/).filter(Boolean);
  const violations = [];
  if (!text) violations.push("headline_empty");
  if (words.length < 3) violations.push("headline_too_few_words");
  if (words.length > 6) violations.push("headline_too_many_words");
  if (text.length > 34) violations.push("headline_too_long");
  if (/^(а|и|но|если|когда|который|которая|которые|потому|что|как|почему|это|просто)$/i.test(words.at(-1) || "")) {
    violations.push("headline_incomplete");
  }
  const literalViolations = getVisibleTextContractViolations({ contentScript: { headline: text } })
    .filter((violation) => violation === "headline_ambiguous");
  return [...new Set([...violations, ...literalViolations])];
}

function normalizeFrame(value) {
  const frame = String(value || "").trim().toLowerCase();
  return ATTENTION_FRAMES.includes(frame) ? frame : "";
}
