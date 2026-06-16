export const defaultCtaOverlay = {
  enabled: true,
  mode: "text",
  text: "ПОДПИШИСЬ",
  x: 50,
  y: 78,
  scale: 100,
  opacity: 100,
  prompt: "",
  badge: null,
  candidate: null
};

const badgeStyles = [
  { background: "#111111", color: "#ffffff", border: "#ffffff", radius: 10 },
  { background: "#f7e75a", color: "#111111", border: "#111111", radius: 8 },
  { background: "#ffffff", color: "#1f2528", border: "#1f6f73", radius: 6 }
];

export function normalizeCtaOverlay(value = {}) {
  const mode = value.mode === "badge" ? "badge" : "text";
  return {
    enabled: value.enabled !== false,
    mode,
    text: normalizeCtaText(value.text),
    x: clampCtaNumber(value.x, defaultCtaOverlay.x, 5, 95),
    y: clampCtaNumber(value.y, defaultCtaOverlay.y, 5, 95),
    scale: clampCtaNumber(value.scale, defaultCtaOverlay.scale, 60, 150),
    opacity: clampCtaNumber(value.opacity, defaultCtaOverlay.opacity, 20, 100),
    prompt: normalizeCtaPrompt(value.prompt),
    badge: value.badge || null,
    candidate: value.candidate || null
  };
}

export function createCtaBadgeCandidate(input = {}) {
  const text = normalizeCtaText(input.text);
  const style = badgeStyles[Math.abs(hashCtaText(text)) % badgeStyles.length];
  return {
    id: `cta-badge-${Date.now().toString(36)}`,
    status: input.status || "submitting",
    text,
    prompt: input.prompt || "",
    finalPrompt: buildCtaBadgePrompt({ text, prompt: input.prompt }),
    taskId: input.taskId || "",
    imageUrl: input.imageUrl || "",
    failMsg: "",
    ...style,
    createdAt: new Date().toISOString()
  };
}

export function attachCtaBadgeTask(candidate, taskId) {
  return { ...candidate, taskId, status: "generating", failMsg: "" };
}

export function attachCtaBadgeImage(candidate, imageUrl) {
  return { ...candidate, imageUrl, status: "review", failMsg: "" };
}

export function failCtaBadgeCandidate(candidate, message) {
  return { ...candidate, status: "failed", failMsg: message || "Не удалось сгенерировать плашку" };
}

export function buildCtaBadgePrompt({ text, prompt } = {}) {
  return [
    "GPT Image 2: create one standalone CTA sticker/badge asset for a vertical Reels video overlay.",
    "Generate only the badge, not a poster, not a full frame, no avatar, no background scene.",
    "The badge must be centered, isolated, large, readable, with clean edges and transparent or plain neutral background.",
    "Use bold Russian text exactly as provided. Do not add extra words, logos, icons, handles, prices or disclaimers.",
    `Text: ${normalizeCtaText(text)}.`,
    prompt ? `Style: ${normalizeCtaPrompt(prompt)}.` : "Style: stylish, modern, high-contrast social media sticker."
  ].join(" ");
}

export function approveCtaBadgeCandidate(overlay = {}) {
  const normalized = normalizeCtaOverlay(overlay);
  if (!normalized.candidate) return normalized;
  return {
    ...normalized,
    mode: "badge",
    text: normalized.candidate.text || normalized.text,
    badge: { ...normalized.candidate, status: "approved" },
    candidate: null
  };
}

function normalizeCtaText(value) {
  const text = String(value || "").trim();
  return text ? text.slice(0, 32) : defaultCtaOverlay.text;
}

function normalizeCtaPrompt(value) {
  return String(value || "").trim().slice(0, 280);
}

function clampCtaNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function hashCtaText(value) {
  return String(value || "").split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
}
