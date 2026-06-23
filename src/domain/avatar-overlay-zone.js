import { noAvatarCharacterId } from "./avatar-selection.js";
import { normalizeCtaOverlay } from "./cta-overlay.js";

const CANVAS = { width: 1024, height: 1792 };
const DEFAULT_AVATAR_OVERLAY = { x: 75, y: 100, scale: 37, opacity: 100 };
const MIN_PADDING = 32;

export function createAvatarReservedZone({ character, ctaOverlay } = {}) {
  const video = pickOverlayVideo(character);
  if (!hasAvatarOverlay(character, video)) return null;
  const avatar = normalizeAvatarOverlay(video?.overlay || DEFAULT_AVATAR_OVERLAY);
  const avatarBox = expandBox(getAvatarBox(avatar), MIN_PADDING);
  const ctaBox = getCtaBox(video?.ctaOverlay || ctaOverlay);
  const boxes = ctaBox ? [avatarBox, expandBox(ctaBox, 22)] : [avatarBox];
  const merged = boxes.reduce(mergeBoxes);
  return {
    canvas: `${CANVAS.width}x${CANVAS.height}`,
    anchor: describeAnchor(avatar),
    avatarBox,
    ctaBox,
    reservedBox: merged,
    hasCta: Boolean(ctaBox)
  };
}

export function formatAvatarReservedZonePrompt(zone) {
  if (!zone) return "";
  const reserved = formatBox(zone.reservedBox);
  const avatar = formatBox(zone.avatarBox);
  const cta = zone.ctaBox ? ` CTA badge may appear at ${formatBox(zone.ctaBox)} from second 3.` : "";
  return [
    `AVATAR RESERVED ZONE: final video will overlay a waist-up avatar in the ${zone.anchor}; keep this area naturally open.`,
    `Canvas ${zone.canvas}. Do not place text, numbers, logos, product labels, key icons, faces, charts, or important objects inside reserved rectangle ${reserved}.`,
    `Avatar body occupies about ${avatar}.${cta}`,
    "Use this reserved area as intentional negative space: background texture, soft blur, decorative light, empty desk/scene area, or low-detail pattern only.",
    "Do not draw the avatar, presenter, CTA badge, or 'read description' text inside the generated image; they are added later in video assembly.",
    "If the design reference has important content in this zone, adapt the layout so the same style remains but semantic content moves outside the avatar zone."
  ].join(" ");
}

function hasAvatarOverlay(character, video) {
  if (!character || character.id === noAvatarCharacterId || character.status === "no-avatar") return false;
  if (!video) return false;
  return character.isActive !== false;
}

function pickOverlayVideo(character) {
  const videos = Array.isArray(character?.avatarVideos) ? character.avatarVideos : [];
  return videos.find((video) => video.isActive !== false && (video.alphaVideoUrl || video.videoUrl || video.overlay))
    || videos.find((video) => video.overlay)
    || null;
}

function getAvatarBox(overlay) {
  const width = CANVAS.width * (overlay.scale / 100);
  const height = width * (16 / 9);
  const centerX = CANVAS.width * (overlay.x / 100);
  const bottomY = CANVAS.height * (overlay.y / 100);
  return clampBox({
    x1: centerX - width / 2,
    y1: bottomY - height,
    x2: centerX + width / 2,
    y2: bottomY
  });
}

function getCtaBox(ctaOverlay) {
  const cta = normalizeCtaOverlay(ctaOverlay || {});
  if (!cta.enabled) return null;
  const width = 360 * (cta.scale / 100);
  const height = 110 * (cta.scale / 100);
  const centerX = CANVAS.width * (cta.x / 100);
  const centerY = CANVAS.height * (cta.y / 100);
  return clampBox({
    x1: centerX - width / 2,
    y1: centerY - height / 2,
    x2: centerX + width / 2,
    y2: centerY + height / 2
  });
}

function normalizeAvatarOverlay(value = {}) {
  return {
    x: clampNumber(value.x, DEFAULT_AVATAR_OVERLAY.x, 15, 85),
    y: clampNumber(value.y, DEFAULT_AVATAR_OVERLAY.y, 45, 100),
    scale: clampNumber(value.scale, DEFAULT_AVATAR_OVERLAY.scale, 35, 150),
    opacity: clampNumber(value.opacity, DEFAULT_AVATAR_OVERLAY.opacity, 30, 100)
  };
}

function describeAnchor(overlay) {
  const horizontal = overlay.x < 40 ? "bottom-left" : overlay.x > 60 ? "bottom-right" : "bottom-center";
  return horizontal;
}

function expandBox(box, padding) {
  return clampBox({
    x1: box.x1 - padding,
    y1: box.y1 - padding,
    x2: box.x2 + padding,
    y2: box.y2 + padding
  });
}

function mergeBoxes(a, b) {
  return {
    x1: Math.min(a.x1, b.x1),
    y1: Math.min(a.y1, b.y1),
    x2: Math.max(a.x2, b.x2),
    y2: Math.max(a.y2, b.y2)
  };
}

function clampBox(box) {
  return {
    x1: clampNumber(box.x1, 0, 0, CANVAS.width),
    y1: clampNumber(box.y1, 0, 0, CANVAS.height),
    x2: clampNumber(box.x2, CANVAS.width, 0, CANVAS.width),
    y2: clampNumber(box.y2, CANVAS.height, 0, CANVAS.height)
  };
}

function formatBox(box) {
  return `x=${box.x1}..${box.x2}, y=${box.y1}..${box.y2}`;
}

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}
