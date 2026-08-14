export const defaultCtaOverlay = {
  enabled: true,
  mode: "badge",
  text: "ЧИТАЙ ОПИСАНИЕ",
  x: 50,
  y: 78,
  scale: 100,
  opacity: 100,
  background: "#ffffff",
  color: "#111111",
  border: "#111111",
  radius: 10,
  prompt: "",
  badge: null,
  candidate: null
};

const defaultBadgeStyle = {
  background: "#ffffff",
  color: "#111111",
  border: "#111111",
  radius: 10
};

export function normalizeCtaOverlay(value = {}) {
  const mode = value.mode === "text" ? "text" : defaultCtaOverlay.mode;
  return {
    enabled: normalizeCtaEnabled(value.enabled),
    mode,
    text: normalizeCtaText(value.text),
    x: clampCtaNumber(value.x, defaultCtaOverlay.x, 5, 95),
    y: clampCtaNumber(value.y, defaultCtaOverlay.y, 5, 95),
    scale: clampCtaNumber(value.scale, defaultCtaOverlay.scale, 60, 150),
    opacity: clampCtaNumber(value.opacity, defaultCtaOverlay.opacity, 20, 100),
    background: normalizeHexColor(value.background, defaultCtaOverlay.background),
    color: normalizeHexColor(value.color, defaultCtaOverlay.color),
    border: normalizeHexColor(value.border, defaultCtaOverlay.border),
    radius: clampCtaNumber(value.radius, defaultCtaOverlay.radius, 0, 40),
    prompt: normalizeCtaPrompt(value.prompt),
    badge: value.badge || null,
    candidate: value.candidate || null
  };
}

function normalizeCtaEnabled(value) {
  if (value === false || value === 0) return false;
  if (typeof value === "string" && ["false", "0", "off", "no"].includes(value.trim().toLowerCase())) return false;
  return true;
}

export function createCtaBadgeCandidate(input = {}) {
  const overlay = normalizeCtaOverlay(input);
  const text = overlay.text;
  return {
    id: `cta-badge-${Date.now().toString(36)}`,
    status: input.status || "submitting",
    text,
    prompt: overlay.prompt || "",
    finalPrompt: buildCtaBadgePrompt(overlay),
    taskId: input.taskId || "",
    imageUrl: input.imageUrl || "",
    failMsg: "",
    ...defaultBadgeStyle,
    background: overlay.background,
    color: overlay.color,
    border: overlay.border,
    radius: overlay.radius,
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
    prompt
      ? `Style: ${normalizeCtaPrompt(prompt)}. Keep the badge very readable, with white base, black text and clear contrast unless the prompt explicitly asks for another palette.`
      : "Style: clean white rounded badge, bold black text, thin black border, minimal high-contrast social media sticker."
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

export function resetCtaOverlay() {
  return normalizeCtaOverlay({
    ...defaultCtaOverlay,
    badge: null,
    candidate: null,
    prompt: ""
  });
}

function normalizeCtaText(value) {
  const text = String(value || "").trim();
  return text ? text.slice(0, 32) : defaultCtaOverlay.text;
}

function normalizeCtaPrompt(value) {
  return String(value || "").trim().slice(0, 280);
}

function normalizeHexColor(value, fallback) {
  const normalized = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(normalized) ? normalized.toLowerCase() : fallback;
}

function clampCtaNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}
