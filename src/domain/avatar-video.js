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
  return {
    id: createAvatarVideoId(),
    imageTaskId: "",
    taskId: "",
    provider: "kie.ai",
    model: "kling-3.0/video",
    status: "preparing-image",
    name: `${character.name || "Аватар"} · хромакей`,
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

export function attachAvatarChromaImageTask(video, imageTaskId) {
  return { ...video, imageTaskId, status: "generating-image" };
}

export function attachAvatarChromaImage(video, imageUrl) {
  return { ...video, chromaImageUrl: imageUrl, status: "submitting-video", failMsg: "" };
}

export function attachAvatarVideoTask(video, taskId) {
  return { ...video, taskId, status: "waiting" };
}

export function attachCompositeAvatarVideo(video, { videoUrl, backgroundImageUrl }) {
  return { ...video, status: "ready", compositeVideoUrl: videoUrl, backgroundImageUrl, failMsg: "" };
}

export function updateAvatarVideoRecord(video, status) {
  if (["success", "succeeded", "completed", "complete"].includes(status.state) && status.videoUrl) {
    return { ...video, status: "ready", videoUrl: status.videoUrl, failMsg: "" };
  }

  if (status.state === "fail" || status.state === "failed") {
    return { ...video, status: "failed", failMsg: status.failMsg || "Kie.ai video generation failed" };
  }

  return { ...video, status: normalizeAvatarVideoKieState(status.state) || video.status };
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

function createAvatarVideoId() {
  return `avatar-video-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function normalizeAvatarVideoRecordOverlay(payload = {}) {
  return {
    x: clampAvatarVideoRecordNumber(payload.x, 50, 15, 85),
    y: clampAvatarVideoRecordNumber(payload.y, 98, 45, 100),
    scale: clampAvatarVideoRecordNumber(payload.scale, 96, 60, 150),
    opacity: clampAvatarVideoRecordNumber(payload.opacity, 100, 30, 100)
  };
}

function clampAvatarVideoRecordNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}
