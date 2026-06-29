import { normalizeCtaOverlay } from "./cta-overlay.js";

const CHROMA_KEY_CONTRACT = [
  "Create a vertical 9:16 chroma key video.",
  "The same avatar from the reference image is shown from the waist up only, medium shot, centered in frame.",
  "Top of head has small margin, waist visible near the lower third of the frame.",
  "The avatar occupies about 65% of frame height.",
  "Pure solid chroma key green background (#00FF00), evenly lit, no gradients, no shadows, no floor, no wall texture, no props, no furniture, no text.",
  "Static camera, no zoom, no crop changes, no camera movement.",
  "Keep identity, face, hairstyle, outfit, age, body proportions and style consistent with the reference image."
];

const NEGATIVE_CONTRACT = [
  "Do not show full body.",
  "Do not show close-up face.",
  "Do not change framing.",
  "Do not move camera.",
  "No background scene.",
  "No shadows on green screen.",
  "No additional objects.",
  "No text."
];

export function createAvatarVideoRecord(character, payload = {}) {
  const motionPrompt = payload.motionPrompt || "Subtle natural idle movements and small hand gestures.";
  const name = normalizeAvatarVideoRecordName(payload.name || payload.emotionName || `${character.name || "Аватар"} · спокойная экспертность`);
  return {
    id: createAvatarVideoId(),
    imageTaskId: "",
    taskId: "",
    provider: "kie.ai",
    model: "kling-3.0/video",
    status: "preparing-image",
    name,
    motionPrompt,
    imagePrompt: buildAvatarChromaImagePrompt(character, motionPrompt),
    finalPrompt: buildAvatarVideoPrompt(character, motionPrompt),
    chromaImageUrl: "",
    videoUrl: "",
    alphaVideoUrl: "",
    alphaStatus: "idle",
    alphaFailMsg: "",
    compositeVideoUrl: "",
    backgroundImageUrl: payload.backgroundImageUrl || "",
    overlay: normalizeAvatarVideoRecordOverlay(payload.overlay),
    ctaOverlay: normalizeCtaOverlay(payload.ctaOverlay),
    isActive: payload.isActive !== false,
    failMsg: "",
    createdAt: new Date().toISOString(),
    settings: {
      duration: "5",
      aspectRatio: "9:16",
      mode: "pro",
      sound: false,
      framing: "waist-up medium shot"
    }
  };
}

export function updateAvatarVideoName(video, name) {
  const normalized = normalizeAvatarVideoRecordName(name);
  return normalized ? { ...video, name: normalized } : video;
}

export function attachAvatarChromaImageTask(video, imageTaskId) {
  return { ...clearAvatarVideoRecovery(video), imageTaskId, status: "generating-image" };
}

export function attachAvatarChromaImage(video, imageUrl) {
  return { ...clearAvatarVideoRecovery(video), chromaImageUrl: imageUrl, status: "submitting-video", failMsg: "" };
}

export function attachAvatarVideoTask(video, taskId) {
  return { ...clearAvatarVideoRecovery(video), taskId, status: "waiting" };
}

export function attachCompositeAvatarVideo(video, { videoUrl, backgroundImageUrl }) {
  return { ...video, status: "ready", compositeVideoUrl: videoUrl, backgroundImageUrl, failMsg: "" };
}

export function updateAvatarVideoRecord(video, status) {
  if (["success", "succeeded", "completed", "complete"].includes(status.state) && status.videoUrl) {
    return { ...clearAvatarVideoRecovery(video), status: "ready", videoUrl: status.videoUrl, failMsg: "" };
  }

  if (["fail", "failed", "error"].includes(status.state)) {
    return { ...video, status: "failed", failMsg: status.failMsg || "Kie.ai video generation failed" };
  }

  return { ...clearAvatarVideoRecovery(video), status: normalizeAvatarVideoKieState(status.state) || video.status };
}

export function markAvatarVideoConnectionRecovering(video, message) {
  return {
    ...video,
    failMsg: message,
    recoveryCount: Math.max(0, Number(video.recoveryCount) || 0) + 1,
    recoveryUpdatedAt: new Date().toISOString()
  };
}

export function markAvatarAlphaConnectionRecovering(video, message) {
  return {
    ...video,
    alphaStatus: "converting",
    alphaFailMsg: message,
    alphaRecoveryCount: Math.max(0, Number(video.alphaRecoveryCount) || 0) + 1,
    alphaRecoveryUpdatedAt: new Date().toISOString()
  };
}

export function attachAvatarAlphaVideo(video, alphaVideoUrl) {
  return {
    ...video,
    alphaStatus: "ready",
    alphaVideoUrl,
    alphaFailMsg: "",
    alphaRecoveryCount: 0,
    alphaRecoveryUpdatedAt: ""
  };
}

export function buildAvatarVideoPrompt(character, motionPrompt = "") {
  return [
    ...CHROMA_KEY_CONTRACT,
    "Animate the provided chroma key still image. Keep the exact green background and framing from the input image.",
    `Avatar name: ${character.name || "project avatar"}.`,
    `Motion instruction: ${motionPrompt || "Subtle natural idle movements and small hand gestures."}`,
    ...NEGATIVE_CONTRACT
  ].join(" ");
}

export function buildAvatarChromaImagePrompt(character, motionPrompt = "") {
  return [
    "GPT Image 2 image-to-image: create one clean vertical 9:16 chroma key still image from the provided avatar reference.",
    "Use the same avatar identity from the reference image: same face, hair, age, outfit, body proportions and general look.",
    "Frame waist-up only, medium shot, centered. Top of head has small margin, waist visible near lower third.",
    "Avatar occupies about 65% of frame height.",
    "Background must be pure solid chroma key green #00FF00, evenly lit, no gradients, no shadows, no floor, no wall texture, no props, no furniture, no text.",
    "Static camera composition for later video animation. No full body, no close-up face, no crop changes.",
    `Avatar name: ${character.name || "project avatar"}.`,
    `Future motion to support: ${motionPrompt || "Subtle natural idle movements and small hand gestures."}`
  ].join(" ");
}

function normalizeAvatarVideoKieState(state) {
  if (["waiting", "queue", "queued"].includes(state)) return "waiting";
  if (["generating", "running", "processing"].includes(state)) return "generating";
  return state;
}

function clearAvatarVideoRecovery(video) {
  return {
    ...video,
    failMsg: "",
    recoveryCount: 0,
    recoveryUpdatedAt: ""
  };
}

function createAvatarVideoId() {
  return `avatar-video-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function normalizeAvatarVideoRecordName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 80);
}

function normalizeAvatarVideoRecordOverlay(payload = {}) {
  return {
    x: clampAvatarVideoRecordNumber(payload.x, 75, 15, 85),
    y: clampAvatarVideoRecordNumber(payload.y, 100, 45, 100),
    scale: clampAvatarVideoRecordNumber(payload.scale, 37, 35, 150),
    opacity: clampAvatarVideoRecordNumber(payload.opacity, 100, 30, 100)
  };
}

function clampAvatarVideoRecordNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}
