import { unlink } from "node:fs/promises";
import { isNoAvatarCharacterId, noAvatarCharacterId } from "../src/domain/avatar-selection.js";
import { getCompositeAvatarVideoUrl, pickAvatarVideoRoundRobin } from "../src/domain/avatar-video-rotation.js";
import { normalizeCtaOverlay } from "../src/domain/cta-overlay.js";
import { selectServerJobAudio } from "./server-job-audio.mjs";
import { limitImagePrompt } from "../src/domain/image-prompt-budget.js";
import { ensureRussianImagePromptGuard } from "../src/domain/language-policy.js";
import { humanizeProviderErrorMessage } from "../src/domain/provider-error-message.js";
import { buildGenerationYandexDiskFolder } from "../src/state/yandex-disk-paths.js";
import { createOperationLogger, summarizeJobForLog } from "./operation-logger.mjs";
import { reviewServerImageText } from "./server-image-text-review.mjs";

const successStates = ["success", "succeeded", "completed", "complete"];
const failStates = ["fail", "failed", "error"];
const primaryProvider = "gpt-image-2";
const fallbackProvider = "nano-banana-2";
const defaultYandexUploadRetryDelaysMs = [2000, 5000, 15000, 30000, 60000];
const logger = createOperationLogger("server-job");
export { logger as serverJobLogger };

export async function runServerJob(record) {
  logger.log("pipeline:start", { job: summarizeJobForLog(record.job) });
  if (shouldResumeYandexDiskUpload(record)) {
    logger.log("pipeline:resume-disk-upload", { job: summarizeJobForLog(record.job) });
    await uploadServerJobToYandexDisk(record, record.job.finalVideoUrl);
    logger.log("pipeline:done", { job: summarizeJobForLog(record.job) });
    return;
  }
  const image = await runServerImageGeneration(record, primaryProvider);
  await runServerFinalAssembly(record, image.imageUrl);
  logger.log("pipeline:done", { job: summarizeJobForLog(record.job) });
}
export async function resumeServerJob(record) {
  logger.log("resume:start", { job: summarizeJobForLog(record.job) });
  if (record.job.imageUrl) {
    await runServerFinalAssembly(record, record.job.imageUrl);
    return;
  }
  if (record.job.imageTaskId) {
    const image = await pollServerImageTask(record, record.job.imageProvider || primaryProvider, record.job.imageTaskId, 1);
    await runServerFinalAssembly(record, image.imageUrl);
    return;
  }
  throw new Error("Серверная задача была прервана до создания задачи картинки. Запустите генерацию заново.");
}
export async function patchServerJob(record, payload) {
  const previous = summarizeJobForLog(record.job);
  record.job = { ...record.job, ...normalizeQueuePatch(record.job, payload) };
  logger.log("patch", { before: previous, patch: payload, after: summarizeJobForLog(record.job) });
  await persistServerJob(record);
}

export function getServerJobPayload(record) {
  return { job: toPublicServerJob(record.job), avatarUsage: record.avatarUsage };
}

export function toPublicServerJob(job) {
  const { serverJobContext, ...publicJob } = job || {};
  return publicJob;
}

export function isTerminalServerJob(job) {
  return ["done", "review", "failed"].includes(job?.status);
}

export function createResumedServerJobRecord(job, persistJob, recoveredContext = {}, patchLedger = null) {
  return {
    job,
    context: job.serverJobContext || recoveredContext || {},
    origin: getInternalServerOrigin(),
    avatarUsage: null,
    persistJob,
    patchLedger
  };
}

export function getInternalServerOrigin() {
  if (process.env.INTERNAL_SERVER_ORIGIN) return process.env.INTERNAL_SERVER_ORIGIN;
  return `http://127.0.0.1:${process.env.PORT || 4173}`;
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
    prompt: limitImagePrompt(ensureRussianImagePromptGuard(record.job.prompt)),
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
  return pollServerImageTask(record, provider, task.taskId, 0);
}

async function pollServerImageTask(record, provider, taskId, startAttempt = 0) {
  for (let attempt = 0; attempt < 75; attempt += 1) {
    const totalAttempt = startAttempt + attempt;
    await delayServerJobPoll(totalAttempt === 0 ? 6000 : 4000);
    const status = await getServerJson(record.origin, `/api/images/status?taskId=${encodeURIComponent(taskId)}`);
    logger.log("image:poll", {
      job: summarizeJobForLog(record.job),
      provider,
      taskId: taskId || "",
      attempt: totalAttempt + 1,
      state: status.state || "",
      progress: status.progress || 0,
      hasImageUrl: Boolean(status.imageUrl),
      failMsg: status.failMsg || ""
    });
    if (successStates.includes(status.state) && status.imageUrl) {
      const textReview = await reviewServerImageText(record, status.imageUrl, { patchJob: (payload) => patchServerJob(record, payload) });
      if (textReview.retry) return runServerImageGeneration(record, provider);
      await patchServerJob(record, {
        status: "running",
        stage: "assembly",
        progress: 76,
        imageUrl: status.imageUrl,
        imageData: status.imageUrl,
        failMsg: "Картинка готова, сервер собирает видео..."
      });
      logger.log("image:ready", { job: summarizeJobForLog(record.job), provider, taskId: taskId || "" });
      return status;
    }
    if (failStates.includes(status.state)) {
      logger.log("image:provider-failed", {
        job: summarizeJobForLog(record.job),
        provider,
        taskId: taskId || "",
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

  logger.log("image:timeout", { job: summarizeJobForLog(record.job), provider, taskId: taskId || "" });
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
  const avatarVideoPick = allowNoAvatar ? null : pickAvatarVideoRoundRobin(project, selectedCharacterId, {
    videoId: record.job.avatarVideoId,
    emotionName: record.job.avatarEmotionName || record.job.desiredAvatarEmotion
  });
  const avatarVideo = avatarVideoPick?.video;
  const avatarVideoUrl = getCompositeAvatarVideoUrl(avatarVideo);
  const renderWithoutAvatar = allowNoAvatar || !avatarVideoUrl;
  const audio = selectServerJobAudio(record);
  logger.log("assembly:start", {
    job: summarizeJobForLog(record.job),
    renderWithoutAvatar,
    allowNoAvatar,
    hasAvatarVideoUrl: Boolean(avatarVideoUrl),
    avatarVideoId: avatarVideo?.id || "",
    avatarEmotionName: avatarVideo?.name || record.job.avatarEmotionName || "",
    hasAudio: Boolean(audio?.fileData)
  });

  await patchServerJob(record, {
    status: "running",
    stage: "assembly",
    progress: 88,
    music: audio?.title || record.job.music || "",
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

  const requiresDiskUpload = Boolean(project.yandexDiskFolder);
  await patchServerJob(record, {
    status: requiresDiskUpload ? "running" : "done",
    stage: "export",
    progress: requiresDiskUpload ? 96 : 100,
    finalVideoUrl: result.videoUrl,
    finalVideoHasAudio: Boolean(result.hasAudio),
    yandexDiskRequired: requiresDiskUpload,
    diskStatus: requiresDiskUpload ? "uploading" : record.job.diskStatus,
    diskMessage: requiresDiskUpload ? "Сервер сохраняет в Яндекс.Диск..." : record.job.diskMessage,
    failMsg: requiresDiskUpload ? "Видео готово, сервер сохраняет файл в Яндекс.Диск..." : ""
  });
  if (requiresDiskUpload) await uploadServerJobToYandexDisk(record, result.videoUrl);
}

async function uploadServerJobToYandexDisk(record, finalVideoUrl) {
  const project = record.context.project || {};
  if (!project.yandexDiskFolder) {
    logger.log("disk:skip", { job: summarizeJobForLog(record.job), reason: "project has no yandexDiskFolder" });
    return;
  }
  const targetFolder = buildServerJobYandexDiskFolder(record);
  const fileName = buildServerExportFileName(project, record.job);
  try {
    logger.log("disk:start", {
      job: summarizeJobForLog(record.job),
      targetFolder,
      fileName
    });
    await patchServerJob(record, {
      status: "running",
      stage: "export",
      progress: Math.max(96, Number(record.job.progress || 0)),
      yandexDiskRequired: true,
      diskStatus: "uploading",
      diskMessage: "Сервер сохраняет в Яндекс.Диск..."
    });
    const result = await postServerJsonWithRetry(record.origin, "/api/yandex-disk/upload", {
      fileUrl: finalVideoUrl,
      targetFolder,
      fileName
    }, {
      label: "disk:upload",
      delaysMs: getYandexUploadRetryDelaysMs(),
      shouldRetry: (error) => !isMissingLocalUploadSource(error, finalVideoUrl)
    });
    const diskUrl = result.diskUrl || result.publicUrl || "";
    await patchServerJob(record, {
      status: "done",
      stage: "export",
      progress: 100,
      diskStatus: "done",
      diskPath: result.diskPath,
      diskUrl,
      diskVerifiedAt: result.diskVerifiedAt || new Date().toISOString(),
      diskSize: result.diskSize || record.job.diskSize || 0,
      diskVerification: result.diskVerification || null,
      finalVideoUrl: diskUrl || record.job.finalVideoUrl,
      diskMessage: "Сохранено и проверено в Яндекс.Диск",
      failMsg: ""
    });
    await cleanupLocalGeneratedVideo(finalVideoUrl);
    logger.log("disk:done", {
      job: summarizeJobForLog(record.job),
      diskPath: result.diskPath || "",
      diskUrl
    });
  } catch (error) {
    const terminalFailure = isMissingLocalUploadSource(error, finalVideoUrl);
    if (terminalFailure) error.nonRetryable = true;
    await patchServerJob(record, {
      status: terminalFailure ? "failed" : "running",
      stage: "export",
      progress: terminalFailure ? 100 : Math.max(96, Number(record.job.progress || 0)),
      yandexDiskRequired: true,
      ...(terminalFailure ? {
        queueStatus: "failed",
        queueLastError: error.message || "Файл финального видео отсутствует на сервере",
        serverJobFailedAt: new Date().toISOString()
      } : {}),
      diskStatus: "failed",
      diskMessage: error.message || "Не удалось сохранить в Яндекс.Диск",
      failMsg: error.message || "Не удалось сохранить в Яндекс.Диск"
    });
    logger.log("disk:failed", { job: summarizeJobForLog(record.job), error: error.message || error });
    throw error;
  }
}

function isMissingLocalUploadSource(error, finalVideoUrl) {
  const source = String(finalVideoUrl || "");
  const missing = error?.code === "ENOENT" || /ENOENT|no such file or directory/i.test(String(error?.message || error || ""));
  return missing && !/^https?:\/\//i.test(source) && !source.startsWith("data:");
}

function shouldResumeYandexDiskUpload(record) {
  const project = record.context.project || {};
  if (!project.yandexDiskFolder || !record.job?.finalVideoUrl) return false;
  if (record.job.diskStatus === "done" && record.job.diskVerifiedAt) return false;
  return record.job.yandexDiskRequired
    || record.job.stage === "export"
    || ["uploading", "failed", "retrying"].includes(record.job.diskStatus);
}

function buildServerJobYandexDiskFolder(record) {
  const project = record.context.project || {};
  return buildGenerationYandexDiskFolder(project.yandexDiskFolder, {
    projectName: project.name || "Проект",
    brandName: project.client || project.name || "Бренд",
    avatarName: resolveServerJobAvatarName(project, record.job, record.context.selectedCharacterId),
    productName: resolveServerJobProductName(record)
  });
}

function resolveServerJobProductName(record) {
  const productId = record.job.productId || record.context.product?.id || "";
  return record.job.productName
    || record.context.product?.name
    || record.context.products?.find((item) => item.id === productId)?.name
    || "Без продукта";
}

async function cleanupLocalGeneratedVideo(videoUrl) {
  const localPath = getLocalGeneratedVideoPath(videoUrl);
  if (!localPath) return;
  try {
    await unlink(localPath);
    logger.log("disk:local-cleanup", { file: localPath });
  } catch (error) {
    if (error?.code === "ENOENT") return;
    logger.log("disk:local-cleanup-failed", { file: localPath, error: error.message || error });
  }
}

function getLocalGeneratedVideoPath(videoUrl) {
  const value = String(videoUrl || "").split("?")[0];
  if (!value.startsWith("/generated/")) return "";
  return value.replace(/^\/+/, "");
}

async function persistServerJob(record) {
  try {
    await record.persistJob?.(record.job);
    await record.patchLedger?.(record.job);
    logger.log("persist:done", { job: summarizeJobForLog(record.job) });
  } catch (error) {
    logger.log("persist:error", { job: summarizeJobForLog(record.job), error: error.message || error });
    console.warn(`[server-job:persist:error] ${error.message || error}`);
  }
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

export function buildServerExportFileName(project, job) {
  const uniqueId = getShortJobId(job);
  const title = `${project.name || "project"}-${job.productName || ""}-${job.title || job.id}`
    .toLowerCase()
    .replace(/[^a-zа-я0-9ё]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
  return `${title || "video"}-${uniqueId}.mp4`;
}

function getShortJobId(job) {
  const normalized = String(job?.id || Date.now().toString(36))
    .toLowerCase()
    .replace(/^job[-_]?/i, "")
    .replace(/[^a-z0-9]+/g, "");
  return normalized.slice(0, 8) || "job";
}

function requiresFinalVideo(job) {
  return job?.outputType !== "image" && job?.requiresFinalVideo !== false;
}

function normalizeQueuePatch(job, payload) {
  if (!job?.queueName || !payload.status || payload.queueStatus) return addTerminalTimestamp(payload);
  if (payload.status === "failed") return addTerminalTimestamp({ ...payload, queueStatus: "failed" });
  if (payload.status === "done" || payload.status === "review") return addTerminalTimestamp({ ...payload, queueStatus: "completed" });
  if (payload.status === "running") return { ...payload, queueStatus: "running" };
  return payload;
}

function addTerminalTimestamp(payload) {
  if (payload.status === "failed" && !payload.serverJobFailedAt) {
    return { ...payload, serverJobFailedAt: new Date().toISOString() };
  }
  if ((payload.status === "done" || payload.status === "review") && !payload.serverJobCompletedAt) {
    return { ...payload, serverJobCompletedAt: new Date().toISOString() };
  }
  return payload;
}

async function postServerJson(origin, path, body, options = {}) {
  const timer = logger.time("http:post", { path, body });
  const response = await fetch(`${origin}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(Number(options.timeoutMs || 120000)),
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

async function postServerJsonWithRetry(origin, path, body, options = {}) {
  const delaysMs = Array.isArray(options.delaysMs) ? options.delaysMs : [];
  let lastError;
  for (let attempt = 0; attempt <= delaysMs.length; attempt += 1) {
    try {
      return await postServerJson(origin, path, body, options);
    } catch (error) {
      lastError = error;
      if (attempt >= delaysMs.length || options.shouldRetry?.(error) === false) throw error;
      logger.log("http:retry", {
        path,
        label: options.label || "",
        attempt: attempt + 1,
        nextDelayMs: delaysMs[attempt],
        error: error.message || error
      });
      await delayServerJobPoll(delaysMs[attempt]);
    }
  }
  throw lastError;
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
function getYandexUploadRetryDelaysMs() {
  const configured = String(process.env.YANDEX_UPLOAD_RETRY_DELAYS_MS || "").trim();
  if (!configured) return defaultYandexUploadRetryDelaysMs;
  return configured.split(",").map((item) => Number(item.trim())).filter((item) => Number.isFinite(item) && item >= 0);
}

async function readServerJson(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(humanizeProviderErrorMessage(payload.error || `Server job API failed: ${response.status}`));
  return payload;
}

function delayServerJobPoll(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
