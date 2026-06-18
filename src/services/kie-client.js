export async function createAvatarTask(prompt) {
  return createKieTask("/api/avatars/generate", { prompt, aspectRatio: "9:16", resolution: "1K" });
}

export async function getAvatarTaskStatus(taskId) {
  return getKieStatus("/api/avatars/status", taskId);
}

export async function createImageTask(prompt, inputUrls = [], provider = "gpt-image-2", inputRefs = [], options = {}) {
  return createKieTask("/api/images/generate", {
    prompt,
    inputUrls,
    inputRefs,
    provider,
    aspectRatio: options.aspectRatio || "9:16",
    resolution: options.resolution || "1K",
    outputFormat: options.outputFormat || "png"
  });
}

export async function getImageTaskStatus(taskId) {
  return getKieStatus("/api/images/status", taskId);
}

export async function createAvatarVideoTask({ imageUrl, prompt }) {
  return createKieTask("/api/avatar-videos/generate", { imageUrl, prompt });
}

export async function getAvatarVideoTaskStatus(taskId) {
  return getKieStatus("/api/avatar-videos/status", taskId);
}

export async function createCompositeAvatarVideo({ avatarVideoUrl, backgroundImageUrl, audioData = "", overlay = {}, ctaOverlay = {} }) {
  const payload = { backgroundImageUrl, audioData, overlay, ctaOverlay };
  if (avatarVideoUrl) payload.avatarVideoUrl = avatarVideoUrl;
  return createKieTask("/api/avatar-videos/composite", payload);
}

export async function createAvatarAlphaVideo(videoUrl) {
  return createKieTask("/api/avatar-videos/alpha", { videoUrl });
}

async function createKieTask(path, body) {
  const response = await fetchKie(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await readKieJson(response);
  if (!response.ok) throw new Error(payload.error || "Kie.ai task creation failed");
  return payload;
}

async function getKieStatus(path, taskId) {
  const response = await fetchKie(`${path}?taskId=${encodeURIComponent(taskId)}`);
  const payload = await readKieJson(response);
  if (!response.ok) throw new Error(payload.error || "Kie.ai status request failed");
  return payload;
}

async function fetchKie(path, options) {
  try {
    return await fetch(path, options);
  } catch (error) {
    const connectionError = new Error(`${getApiConnectionMessage()} (${error.message || "network error"})`);
    connectionError.name = "KieConnectionError";
    connectionError.cause = error;
    throw connectionError;
  }
}

export function isKieConnectionError(error) {
  return error?.name === "KieConnectionError";
}

async function readKieJson(response) {
  try {
    return await response.json();
  } catch {
    return { error: "Локальный API вернул пустой или некорректный ответ." };
  }
}

function getApiConnectionMessage() {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  if (origin && !origin.includes("127.0.0.1") && !origin.includes("localhost")) {
    return `Нет соединения с API студии на текущем домене. Проверьте, что контейнер не перезапускается. Текущий адрес: ${origin}`;
  }
  return `Нет соединения с локальным API. Откройте студию через http://127.0.0.1:4173 или запустите npm run start. Текущий адрес: ${origin || "unknown"}`;
}
