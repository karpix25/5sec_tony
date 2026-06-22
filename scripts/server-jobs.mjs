import { isNoAvatarCharacterId, noAvatarCharacterId } from "../src/domain/avatar-selection.js";
import { getCompositeAvatarVideoUrl, pickAvatarVideoRoundRobin } from "../src/domain/avatar-video-rotation.js";
import { normalizeCtaOverlay } from "../src/domain/cta-overlay.js";
import { buildAvatarYandexDiskFolder } from "../src/state/factories.js";

const serverJobs = new Map();
const successStates = ["success", "succeeded", "completed", "complete"];
const failStates = ["fail", "failed", "error"];
const primaryProvider = "gpt-image-2";
const fallbackProvider = "nano-banana-2";

export async function handleServerJobsApi(request, response, url) {
  if (request.method === "POST" && url.pathname === "/api/jobs/run") {
    return startServerJob(request, response);
  }
  if (request.method === "GET" && url.pathname === "/api/jobs/status") {
    return getServerJobStatus(response, url.searchParams.get("jobId"));
  }
  return false;
}

async function startServerJob(request, response) {
  try {
    const body = await readJson(request);
    const job = body.job || {};
    if (!job.id) return sendJson(response, 400, { error: "job.id is required" });
    if (!serverJobs.has(job.id)) {
      const origin = `http://${request.headers.host}`;
      const record = {
        job: { ...job, status: "running", stage: "image", progress: 18, failMsg: "Сервер запустил генерацию..." },
        context: body.context || {},
        origin,
        avatarUsage: null
      };
      serverJobs.set(job.id, record);
      runServerJob(record).catch((error) => {
        patchServerJob(record, {
          status: "failed",
          stage: "image",
          progress: 100,
          failMsg: error.message || "Серверная генерация завершилась ошибкой"
        });
      });
    }
    return sendJson(response, 200, getServerJobPayload(serverJobs.get(job.id)));
  } catch (error) {
    return sendJson(response, 502, { error: error.message || "Не удалось запустить серверную задачу" });
  }
}

function getServerJobStatus(response, jobId) {
  const record = serverJobs.get(jobId || "");
  if (!record) return sendJson(response, 404, { error: "server job not found" });
  return sendJson(response, 200, getServerJobPayload(record));
}

async function runServerJob(record) {
  const image = await runServerImageGeneration(record, primaryProvider);
  await runServerFinalAssembly(record, image.imageUrl);
}

async function runServerImageGeneration(record, provider) {
  patchServerJob(record, {
    status: "running",
    stage: "image",
    progress: provider === fallbackProvider ? 26 : 24,
    imageProvider: provider,
    failMsg: provider === fallbackProvider ? "Основной способ не ответил, пробуем резервный..." : "Сервер ожидает картинку..."
  });
  const task = await postServerJson(record.origin, "/api/images/generate", {
    prompt: record.job.prompt,
    inputUrls: record.job.inputUrls || [],
    inputRefs: record.job.inputRefs || [],
    provider,
    aspectRatio: "9:16",
    resolution: "1K",
    outputFormat: "png"
  });
  patchServerJob(record, { imageTaskId: task.taskId, imageProvider: provider });

  for (let attempt = 0; attempt < 75; attempt += 1) {
    await delayServerJobPoll(attempt === 0 ? 6000 : 4000);
    const status = await getServerJson(record.origin, `/api/images/status?taskId=${encodeURIComponent(task.taskId)}`);
    if (successStates.includes(status.state) && status.imageUrl) {
      patchServerJob(record, {
        status: "running",
        stage: "assembly",
        progress: 76,
        imageUrl: status.imageUrl,
        imageData: status.imageUrl,
        failMsg: "Картинка готова, сервер собирает видео..."
      });
      return status;
    }
    if (failStates.includes(status.state)) {
      if (provider === primaryProvider) return runServerImageGeneration(record, fallbackProvider);
      throw new Error(status.failMsg || "Генерация картинки завершилась ошибкой");
    }
    patchServerJob(record, {
      status: "running",
      stage: "image",
      progress: Math.min(72, 24 + attempt * 4)
    });
  }

  if (provider === primaryProvider) return runServerImageGeneration(record, fallbackProvider);
  throw new Error("Не удалось получить картинку за 5 минут. Попробуйте запустить еще раз.");
}

async function runServerFinalAssembly(record, backgroundImageUrl) {
  if (!requiresFinalVideo(record.job)) {
    patchServerJob(record, { status: "review", stage: "approval", progress: 76, failMsg: "" });
    return;
  }

  const project = record.context.project || {};
  const selectedCharacterId = record.job.characterId || record.context.selectedCharacterId || noAvatarCharacterId;
  const allowNoAvatar = isNoAvatarCharacterId(selectedCharacterId);
  const avatarVideoPick = allowNoAvatar ? null : pickAvatarVideoRoundRobin(project, selectedCharacterId);
  const avatarVideo = avatarVideoPick?.video;
  const avatarVideoUrl = getCompositeAvatarVideoUrl(avatarVideo);
  const renderWithoutAvatar = allowNoAvatar || !avatarVideoUrl;
  const audio = getServerJobAudio(record);

  patchServerJob(record, {
    status: "running",
    stage: "assembly",
    progress: 88,
    renderedWithoutAvatar: renderWithoutAvatar,
    failMsg: renderWithoutAvatar
      ? "Сервер собирает финальное видео из картинки и аудио..."
      : "Сервер собирает финальное видео с аватаром и аудио..."
  });

  const result = await postServerJson(record.origin, "/api/avatar-videos/composite", {
    avatarVideoUrl: renderWithoutAvatar ? "" : avatarVideoUrl,
    backgroundImageUrl,
    audioData: audio?.fileData || "",
    overlay: renderWithoutAvatar ? {} : avatarVideo?.overlay || {},
    ctaOverlay: renderWithoutAvatar
      ? resolveServerNoAvatarCtaOverlay(project)
      : avatarVideo?.ctaOverlay || { enabled: false }
  });

  if (!renderWithoutAvatar && avatarVideoPick && avatarVideo?.id) {
    record.avatarUsage = {
      characterId: avatarVideoPick.characterId,
      videoId: avatarVideo.id,
      nextIndex: avatarVideoPick.nextIndex,
      nextCharacterIndex: avatarVideoPick.nextCharacterIndex
    };
  }

  patchServerJob(record, {
    status: "done",
    stage: "export",
    progress: 100,
    finalVideoUrl: result.videoUrl,
    finalVideoHasAudio: Boolean(result.hasAudio),
    failMsg: ""
  });
  await uploadServerJobToYandexDisk(record, result.videoUrl);
}

async function uploadServerJobToYandexDisk(record, finalVideoUrl) {
  const project = record.context.project || {};
  if (!project.yandexDiskFolder) return;
  const avatarName = resolveServerJobAvatarName(project, record.job, record.context.selectedCharacterId);
  try {
    patchServerJob(record, { diskStatus: "uploading", diskMessage: "Сервер сохраняет в Яндекс.Диск..." });
    const result = await postServerJson(record.origin, "/api/yandex-disk/upload", {
      fileUrl: finalVideoUrl,
      targetFolder: buildAvatarYandexDiskFolder(project.yandexDiskFolder, avatarName),
      fileName: buildServerExportFileName(project, record.job)
    });
    patchServerJob(record, {
      diskStatus: "done",
      diskPath: result.diskPath,
      diskMessage: "Сохранено в Яндекс.Диск"
    });
  } catch (error) {
    patchServerJob(record, {
      diskStatus: "failed",
      diskMessage: error.message || "Не удалось сохранить в Яндекс.Диск"
    });
  }
}

function getServerJobPayload(record) {
  return { job: record.job, avatarUsage: record.avatarUsage };
}

function patchServerJob(record, payload) {
  record.job = { ...record.job, ...payload };
}

function getServerJobAudio(record) {
  return (record.context.audioLibrary || []).find((item) => item.title === record.job.music)
    || (record.context.audioLibrary || []).find((item) => item.id === record.context.selectedAudioId);
}

function resolveServerNoAvatarCtaOverlay(project) {
  const savedOverlay = project?.ctaOverlay || (project?.characters || [])
    .flatMap((character) => character.avatarVideos || [])
    .find((video) => video.ctaOverlay)?.ctaOverlay;
  return normalizeCtaOverlay(savedOverlay);
}

function resolveServerJobAvatarName(project, job, fallbackCharacterId = "") {
  if (job.renderedWithoutAvatar) return "Без аватара";
  if (isNoAvatarCharacterId(job.characterId || fallbackCharacterId)) return "Без аватара";
  return project.characters?.find((item) => item.id === (job.characterId || fallbackCharacterId))?.name || "Без аватара";
}

function buildServerExportFileName(project, job) {
  const title = `${project.name || "project"}-${job.title || job.id}`
    .toLowerCase()
    .replace(/[^a-zа-я0-9ё]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${title || job.id}.mp4`;
}

function requiresFinalVideo(job) {
  return job?.outputType !== "image" && job?.requiresFinalVideo !== false;
}

async function postServerJson(origin, path, body) {
  const response = await fetch(`${origin}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return readServerJson(response);
}

async function getServerJson(origin, path) {
  const response = await fetch(`${origin}${path}`);
  return readServerJson(response);
}

async function readServerJson(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Server job API failed: ${response.status}`);
  return payload;
}

function delayServerJobPoll(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let data = "";
    request.on("data", (chunk) => { data += chunk; });
    request.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch (error) { reject(error); }
    });
  });
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
  return true;
}
