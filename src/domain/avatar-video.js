import { normalizeCtaOverlay } from "./cta-overlay.js";
import { ensureRussianAvatarVideoPromptGuard } from "./language-policy.js";

const CHROMA_KEY_CONTRACT = [
  "Создай вертикальное 9:16 хромакей-видео.",
  "Тот же аватар с референсного изображения показан только по пояс, средний план, по центру кадра.",
  "Над головой небольшой отступ, талия видна около нижней трети кадра.",
  "Аватар занимает примерно 65% высоты кадра.",
  "Фон чистый однотонный chroma key green #00FF00, ровно освещенный, без градиентов, теней, пола, стены, фактуры, реквизита, мебели и текста.",
  "Камера статична: без приближения, без смены кадрирования, без движения камеры.",
  "Сохрани идентичность, лицо, волосы, одежду, возраст, пропорции тела и общий стиль как на референсе."
];

const NEGATIVE_CONTRACT = [
  "Не показывать полный рост.",
  "Не делать крупный план лица.",
  "Не менять кадрирование.",
  "Не двигать камеру.",
  "Не добавлять фоновые сцены.",
  "Не добавлять тени на зеленом фоне.",
  "Не добавлять дополнительные объекты.",
  "Не добавлять текст, субтитры, речь или английские слова."
];

export function createAvatarVideoRecord(character, payload = {}) {
  const motionPrompt = payload.motionPrompt || "Спокойные естественные микродвижения и небольшие жесты руками.";
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
  return ensureRussianAvatarVideoPromptGuard([
    ...CHROMA_KEY_CONTRACT,
    "Анимируй предоставленное хромакей-изображение. Сохрани точный зеленый фон и кадрирование из входного изображения.",
    `Имя аватара: ${character.name || "аватар проекта"}.`,
    `Инструкция по движению: ${motionPrompt || "Спокойные естественные микродвижения и небольшие жесты руками."}`,
    ...NEGATIVE_CONTRACT
  ].join(" "));
}

export function buildAvatarChromaImagePrompt(character, motionPrompt = "") {
  return ensureRussianAvatarVideoPromptGuard([
    "GPT Image 2 image-to-image: создай один чистый вертикальный 9:16 хромакей-кадр по предоставленному референсу аватара.",
    "Используй ту же идентичность аватара из референса: то же лицо, волосы, возраст, одежда, пропорции тела и общий образ.",
    "Кадр только по пояс, средний план, по центру. Над головой небольшой отступ, талия видна около нижней трети.",
    "Аватар занимает примерно 65% высоты кадра.",
    "Фон должен быть чистым однотонным chroma key green #00FF00, ровно освещенным, без градиентов, теней, пола, стены, фактуры, реквизита, мебели и текста.",
    "Статичная композиция камеры для будущей видео-анимации. Без полного роста, без крупного плана лица, без изменения кадрирования.",
    `Имя аватара: ${character.name || "аватар проекта"}.`,
    `Будущее движение: ${motionPrompt || "Спокойные естественные микродвижения и небольшие жесты руками."}`
  ].join(" "));
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
