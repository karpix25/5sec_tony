import { isNoAvatarCharacterId, noAvatarCharacterId } from "../src/domain/avatar-selection.js";
import { getCompositeAvatarVideoUrl, pickAvatarVideoRoundRobin } from "../src/domain/avatar-video-rotation.js";
import { normalizeCtaOverlay } from "../src/domain/cta-overlay.js";
import { limitImagePrompt } from "../src/domain/image-prompt-budget.js";
import { humanizeProviderErrorMessage } from "../src/domain/provider-error-message.js";
import { buildAvatarYandexDiskFolder } from "../src/state/factories.js";
import { createOperationLogger, summarizeJobForLog, summarizeServerJobContext } from "./operation-logger.mjs";
import { loadPersistedServerJob, persistServerJobSnapshot } from "./server-job-state.mjs";

const serverJobs = new Map();
const successStates = ["success", "succeeded", "completed", "complete"];
const failStates = ["fail", "failed", "error"];
const primaryProvider = "gpt-image-2";
const fallbackProvider = "nano-banana-2";
const logger = createOperationLogger("server-job");

export async function handleServerJobsApi(request, response, url) {
  return createServerJobsApiHandler()(request, response, url);
}

export function createServerJobsApiHandler(deps = {}) {
  const jobs = deps.serverJobs || serverJobs;
  const persistJob = deps.persistServerJobSnapshot || persistServerJobSnapshot;
  const loadJob = deps.loadPersistedServerJob || loadPersistedServerJob;
  return async function handleServerJobsApiWithDeps(request, response, url) {
    if (request.method === "POST" && url.pathname === "/api/jobs/run") {
      return startServerJob(request, response, { jobs, persistJob });
    }
    if (request.method === "GET" && url.pathname === "/api/jobs/status") {
      return getServerJobStatus(response, url.searchParams.get("jobId"), { jobs, persistJob, loadJob });
    }
    return false;
  };
}

async function startServerJob(request, response, deps) {
  try {
    const body = await readJson(request);
    const job = body.job || {};
    if (!job.id) return sendJson(response, 400, { error: "job.id is required" });
    logger.log("run:request", {
      job: summarizeJobForLog(job),
      context: summarizeServerJobContext(body.context || {}),
      alreadyRunning: deps.jobs.has(job.id)
    });
    if (!deps.jobs.has(job.id)) {
      const origin = getInternalServerOrigin();
      const record = {
        job: {
          ...job,
          status: "running",
          stage: "image",
          progress: 18,
          serverJobAcceptedAt: new Date().toISOString(),
          failMsg: "Сервер запустил генерацию..."
        },
        context: body.context || {},
        origin,
        avatarUsage: null,
        persistJob: deps.persistJob
      };
      deps.jobs.set(job.id, record);
      await persistServerJob(record);
      logger.log("run:accepted", {
        job: summarizeJobForLog(record.job),
        origin,
        context: summarizeServerJobContext(record.context)
      });
      runServerJob(record).catch(async (error) => {
        logger.log("run:unhandled-error", { job: summarizeJobForLog(record.job), error: error.message || error });
        await patchServerJob(record, {
          status: "failed",
          stage: "image",
          progress: 100,
          failMsg: error.message || "Серверная генерация завершилась ошибкой"
        });
      });
    }
    return sendJson(response, 200, getServerJobPayload(deps.jobs.get(job.id)));
  } catch (error) {
    logger.log("run:request-error", { error: error.message || error });
    return sendJson(response, 502, { error: error.message || "Не удалось запустить серверную задачу" });
  }
}

async function getServerJobStatus(response, jobId, deps) {
  const record = deps.jobs.get(jobId || "");
  if (!record) {
    logger.log("status:miss", { jobId: jobId || "" });
    return sendPersistedServerJobStatus(response, jobId, deps);
  }
  logger.log("status:hit", { job: summarizeJobForLog(record.job) });
  return sendJson(response, 200, getServerJobPayload(record));
}

async function runServerJob(record) {
  logger.log("pipeline:start", { job: summarizeJobForLog(record.job) });
  const image = await runServerImageGeneration(record, primaryProvider);
  await runServerFinalAssembly(record, image.imageUrl);
  logger.log("pipeline:done", { job: summarizeJobForLog(record.job) });
}

async function runServerImageGeneration(record, provider) {
  logger.log("image:start", {
    job: summarizeJobForLog(record.job),
    provider,
    promptChars: String(record.job.prompt || "").length,
    inputUrls: Array.isArray(record.job.inputUrls) ? record.job.inputUrls.length : 0,
    inputRefs: Array.isArray(record.job.inputRefs) ? record.job.inputRefs.length : 0
  });
  await patchServerJob(record, {
    status: "running",
    stage: "image",
    progress: provider === fallbackProvider ? 26 : 24,
    imageProvider: provider,
    failMsg: provider === fallbackProvider ? "Основной способ не ответил, пробуем резервный..." : "Сервер ожидает картинку..."
  });
  const task = await postServerJson(record.origin, "/api/images/generate", {
    prompt: limitImagePrompt(record.job.prompt),
    inputUrls: record.job.inputUrls || [],
    inputRefs: record.job.inputRefs || [],
    promptContract: record.job.promptContract || record.job.imagePromptContract || null,
    productVisibilityDecision: record.job.productVisibilityDecision || null,
    avatarSafeZone: record.job.avatarSafeZone || null,
    provider,
    aspectRatio: "9:16",
    resolution: "1K",
    outputFormat: "png"
  });
  logger.log("image:task-created", { job: summarizeJobForLog(record.job), provider, taskId: task.taskId || "" });
  await patchServerJob(record, { imageTaskId: task.taskId, imageProvider: provider });

  for (let attempt = 0; attempt < 75; attempt += 1) {
    await delayServerJobPoll(attempt === 0 ? 6000 : 4000);
    const status = await getServerJson(record.origin, `/api/images/status?taskId=${encodeURIComponent(task.taskId)}`);
    logger.log("image:poll", {
      job: summarizeJobForLog(record.job),
      provider,
      taskId: task.taskId || "",
      attempt: attempt + 1,
      state: status.state || "",
      progress: status.progress || 0,
      hasImageUrl: Boolean(status.imageUrl),
      failMsg: status.failMsg || ""
    });
    if (successStates.includes(status.state) && status.imageUrl) {
      await patchServerJob(record, {
        status: "running",
        stage: "assembly",
        progress: 76,
        imageUrl: status.imageUrl,
        imageData: status.imageUrl,
        failMsg: "Картинка готова, сервер собирает видео..."
      });
      logger.log("image:ready", { job: summarizeJobForLog(record.job), provider, taskId: task.taskId || "" });
      return status;
    }
    if (failStates.includes(status.state)) {
      logger.log("image:provider-failed", {
        job: summarizeJobForLog(record.job),
        provider,
        taskId: task.taskId || "",
        failMsg: status.failMsg || ""
      });
      if (provider === primaryProvider) return runServerImageGeneration(record, fallbackProvider);
      throw new Error(status.failMsg || "Генерация картинки завершилась ошибкой");
    }
    await patchServerJob(record, {
      status: "running",
      stage: "image",
      progress: Math.min(72, 24 + attempt * 4)
    });
  }

  logger.log("image:timeout", { job: summarizeJobForLog(record.job), provider, taskId: task.taskId || "" });
  if (provider === primaryProvider) return runServerImageGeneration(record, fallbackProvider);
  throw new Error("Не удалось получить картинку за 5 минут. Попробуйте запустить еще раз.");
}

async function runServerFinalAssembly(record, backgroundImageUrl) {
  if (!requiresFinalVideo(record.job)) {
    logger.log("assembly:skip-final-video", { job: summarizeJobForLog(record.job) });
    await patchServerJob(record, { status: "review", stage: "approval", progress: 76, failMsg: "" });
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
  logger.log("assembly:start", {
    job: summarizeJobForLog(record.job),
    renderWithoutAvatar,
    allowNoAvatar,
    hasAvatarVideoUrl: Boolean(avatarVideoUrl),
    avatarVideoId: avatarVideo?.id || "",
    hasAudio: Boolean(audio?.fileData)
  });

  await patchServerJob(record, {
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
  logger.log("assembly:composite-created", {
    job: summarizeJobForLog(record.job),
    videoUrl: result.videoUrl || "",
    hasAudio: Boolean(result.hasAudio)
  });

  if (!renderWithoutAvatar && avatarVideoPick && avatarVideo?.id) {
    record.avatarUsage = {
      characterId: avatarVideoPick.characterId,
      videoId: avatarVideo.id,
      nextIndex: avatarVideoPick.nextIndex,
      nextCharacterIndex: avatarVideoPick.nextCharacterIndex
    };
    logger.log("avatar-usage:reserved", { job: summarizeJobForLog(record.job), avatarUsage: record.avatarUsage });
  }

  await patchServerJob(record, {
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
  if (!project.yandexDiskFolder) {
    logger.log("disk:skip", { job: summarizeJobForLog(record.job), reason: "project has no yandexDiskFolder" });
    return;
  }
  const avatarName = resolveServerJobAvatarName(project, record.job, record.context.selectedCharacterId);
  try {
    logger.log("disk:start", {
      job: summarizeJobForLog(record.job),
      targetFolder: buildAvatarYandexDiskFolder(project.yandexDiskFolder, avatarName),
      fileName: buildServerExportFileName(project, record.job)
    });
    await patchServerJob(record, { diskStatus: "uploading", diskMessage: "Сервер сохраняет в Яндекс.Диск..." });
    const result = await postServerJson(record.origin, "/api/yandex-disk/upload", {
      fileUrl: finalVideoUrl,
      targetFolder: buildAvatarYandexDiskFolder(project.yandexDiskFolder, avatarName),
      fileName: buildServerExportFileName(project, record.job)
    });
    await patchServerJob(record, {
      diskStatus: "done",
      diskPath: result.diskPath,
      diskMessage: "Сохранено в Яндекс.Диск"
    });
    logger.log("disk:done", { job: summarizeJobForLog(record.job), diskPath: result.diskPath || "" });
  } catch (error) {
    await patchServerJob(record, {
      diskStatus: "failed",
      diskMessage: error.message || "Не удалось сохранить в Яндекс.Диск"
    });
    logger.log("disk:failed", { job: summarizeJobForLog(record.job), error: error.message || error });
  }
}

function getInternalServerOrigin() {
  return `http://127.0.0.1:${process.env.PORT || 4173}`;
}

function getServerJobPayload(record) {
  return { job: record.job, avatarUsage: record.avatarUsage };
}

async function patchServerJob(record, payload) {
  const previous = summarizeJobForLog(record.job);
  record.job = { ...record.job, ...payload };
  logger.log("patch", { before: previous, patch: payload, after: summarizeJobForLog(record.job) });
  await persistServerJob(record);
}

async function persistServerJob(record) {
  try {
    await record.persistJob?.(record.job);
    logger.log("persist:done", { job: summarizeJobForLog(record.job) });
  } catch (error) {
    logger.log("persist:error", { job: summarizeJobForLog(record.job), error: error.message || error });
    console.warn(`[server-job:persist:error] ${error.message || error}`);
  }
}

async function sendPersistedServerJobStatus(response, jobId, deps) {
  const job = await deps.loadJob(jobId || "");
  if (!job) {
    logger.log("status:persisted-miss", { jobId: jobId || "" });
    return sendJson(response, 404, { error: "server job not found" });
  }
  logger.log("status:persisted-hit", { job: summarizeJobForLog(job) });
  if (isTerminalServerJob(job)) return sendJson(response, 200, { job, avatarUsage: null });
  const failedJob = {
    ...job,
    status: "failed",
    progress: 100,
    failMsg: "Серверная задача была прервана перезапуском. Запустите генерацию заново."
  };
  await deps.persistJob(failedJob);
  logger.log("status:persisted-interrupted", { job: summarizeJobForLog(failedJob) });
  return sendJson(response, 200, { job: failedJob, avatarUsage: null });
}

function isTerminalServerJob(job) {
  return ["done", "review", "failed"].includes(job?.status);
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
  const timer = logger.time("http:post", { path, body });
  const response = await fetch(`${origin}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  try {
    const payload = await readServerJson(response);
    timer.done({ status: response.status, payload });
    return payload;
  } catch (error) {
    timer.fail(error, { status: response.status });
    throw error;
  }
}

async function getServerJson(origin, path) {
  const timer = logger.time("http:get", { path });
  const response = await fetch(`${origin}${path}`);
  try {
    const payload = await readServerJson(response);
    timer.done({ status: response.status, payload });
    return payload;
  } catch (error) {
    timer.fail(error, { status: response.status });
    throw error;
  }
}

async function readServerJson(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(humanizeProviderErrorMessage(payload.error || `Server job API failed: ${response.status}`));
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
