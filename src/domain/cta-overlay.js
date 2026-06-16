export const defaultCtaOverlay = {
  enabled: true,
  mode: "text",
  text: "ПОДПИШИСЬ",
  x: 50,
  y: 78,
  scale: 100,
  opacity: 100,
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
    badge: value.badge || null,
    candidate: value.candidate || null
  };
}

export function createCtaBadgeCandidate(input = {}) {
  const text = normalizeCtaText(input.text);
  const style = badgeStyles[Math.abs(hashCtaText(text)) % badgeStyles.length];
  return {
    id: `cta-badge-${Date.now().toString(36)}`,
    status: "review",
    text,
    prompt: input.prompt || "",
    ...style,
    createdAt: new Date().toISOString()
  };
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

function clampCtaNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function hashCtaText(value) {
  return String(value || "").split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
}
