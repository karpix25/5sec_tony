import { createAutoGenerationBrief, createGenerationJob, createSemanticPlan } from "../domain/generation.js";
import { getContext } from "../state/store.js";
import { generateAiBrief } from "../services/brief-ai.js";
import { humanizeGenerationPlan } from "../services/text-humanizer.js";
import { createCompositeAvatarVideo, createImageTask, getImageTaskStatus } from "../services/kie-client.js";

const successStates = ["success", "succeeded", "completed", "complete"];
const failStates = ["fail", "failed", "error"];
const primaryProvider = "gpt-image-2";
const fallbackProvider = "nano-banana-2";
const resumedImagePolls = new Set();

export async function runImageJob(store, jobId) {
  const job = findJob(store, jobId);
  if (!job) return;

  try {
    store.patchJob(jobId, { status: "running", stage: "prompt", progress: 12, failMsg: "" });
    const preparedJob = await prepareAiBriefJob(store, jobId);
    await startImageTask(store, jobId, preparedJob, primaryProvider, 24);
  } catch (error) {
    const preparedJob = findJob(store, jobId);
    if (preparedJob) {
      await startFallbackImageTask(store, jobId, preparedJob, error.message || "основная генерация не запустилась");
    }
  }
}

export function resumeRunningImageJobs(store) {
  const jobs = store.getState().jobs.filter((job) => job.status === "running");
  const resumable = [];
  jobs.forEach((job) => {
    if (job.stage === "image" && job.imageTaskId) {
      resumable.push(job);
      return;
    }
    if (job.stage === "prompt" || job.stage === "image") {
      failImageJob(store, job.id, "Задача была прервана обновлением страницы. Запустите генерацию заново.");
    }
  });
  return Promise.all(resumable.map((job) => resumeImageJob(store, job)));
}

function resumeImageJob(store, job) {
  const provider = job.imageProvider || primaryProvider;
  const key = `${job.id}:${provider}:${job.imageTaskId}`;
  if (resumedImagePolls.has(key)) return Promise.resolve();
  resumedImagePolls.add(key);
  store.patchJob(job.id, {
    failMsg: job.failMsg || "Восстановили проверку результата после обновления страницы..."
  });
  return pollImageJob(store, job.id, job.imageTaskId, provider);
}

async function pollImageJob(store, jobId, taskId, provider, attempt = 0) {
  if (attempt >= 75) {
    const job = findJob(store, jobId);
    if (provider === primaryProvider && job) {
      await startFallbackImageTask(store, jobId, job, "основная генерация не вернула картинку за 5 минут");
      return;
    }
    failImageJob(store, jobId, "Не удалось получить картинку за 5 минут. Попробуйте запустить еще раз.");
    return;
  }

  await delayImagePoll(attempt === 0 ? 6000 : 4000);
  const job = findJob(store, jobId);
  if (!job || ["done", "review", "failed"].includes(job.status)) return;

  try {
    const status = await getImageTaskStatus(taskId);
    if (successStates.includes(status.state) && status.imageUrl) {
      store.patchJob(jobId, {
        status: "running",
        stage: "assembly",
        progress: 76,
        imageUrl: status.imageUrl,
        imageData: status.imageUrl,
        failMsg: "Картинка готова, собираем финальное видео..."
      });
      await startFinalVideoAssembly(store, jobId, status.imageUrl);
      return;
    }
    if (failStates.includes(status.state)) {
      if (provider === primaryProvider) {
        await startFallbackImageTask(store, jobId, job, status.failMsg || "основная генерация вернула ошибку");
        return;
      }
      failImageJob(store, jobId, status.failMsg || "Генерация завершилась ошибкой");
      return;
    }
    store.patchJob(jobId, {
      status: "running",
      stage: "image",
      progress: Math.min(72, 24 + attempt * 4)
    });
    pollImageJob(store, jobId, taskId, provider, attempt + 1);
  } catch (error) {
    if (provider === primaryProvider) {
      await startFallbackImageTask(store, jobId, job, error.message || "не удалось проверить основную генерацию");
      return;
    }
    failImageJob(store, jobId, error.message || "Не удалось проверить статус генерации");
  }
}

async function startFinalVideoAssembly(store, jobId, backgroundImageUrl) {
  const state = store.getState();
  const job = findJob(store, jobId);
  const project = state.projects?.find((item) => item.id === job?.projectId);
  const avatarVideo = getReusableAvatarVideo(project);
  if (!job) return;
  if (!avatarVideo?.videoUrl) {
    if (requiresFinalVideo(job)) {
      store.patchJob(jobId, {
        status: "failed",
        stage: "assembly",
        progress: 100,
        failMsg: "Нет готового аватар-видео проекта. Сначала создайте аватар-видео, потом запускайте финальную генерацию."
      });
      return;
    }
    store.patchJob(jobId, {
      status: "review",
      stage: "approval",
      progress: 76,
      failMsg: ""
    });
    return;
  }

  const audio = state.audioLibrary?.find((item) => item.title === job.music)
    || state.audioLibrary?.find((item) => item.id === state.selectedAudioId);
  try {
    store.patchJob(jobId, {
      status: "running",
      stage: "assembly",
      progress: 88,
      failMsg: "Собираем финальное видео с аватаром и аудио..."
    });
    const result = await createCompositeAvatarVideo({
      avatarVideoUrl: avatarVideo.videoUrl,
      backgroundImageUrl,
      audioData: audio?.fileData || ""
    });
    store.patchJob(jobId, {
      status: "done",
      stage: "export",
      progress: 100,
      finalVideoUrl: result.videoUrl,
      finalVideoHasAudio: Boolean(result.hasAudio),
      failMsg: ""
    });
  } catch (error) {
    if (requiresFinalVideo(job)) {
      store.patchJob(jobId, {
        status: "failed",
        stage: "assembly",
        progress: 100,
        failMsg: error.message || "Картинка готова, но финальное видео не собрано"
      });
      return;
    }
    store.patchJob(jobId, {
      status: "review",
      stage: "approval",
      progress: 76,
      failMsg: error.message || "Картинка готова, но финальное видео не собрано"
    });
  }
}

function requiresFinalVideo(job) {
  return job?.outputType !== "image" && job?.requiresFinalVideo !== false;
}

function getReusableAvatarVideo(project) {
  return project?.characters
    ?.flatMap((character) => character.avatarVideos || [])
    .find((video) => video.status === "ready" && video.videoUrl);
}

async function startImageTask(store, jobId, job, provider, progress) {
  const task = await createImageTask(job.prompt, job.inputUrls || [], provider, job.inputRefs || []);
  store.patchJob(jobId, {
    imageTaskId: task.taskId,
    imageProvider: provider,
    status: "running",
    stage: "image",
    progress,
    failMsg: provider === fallbackProvider ? "Основной способ не ответил, пробуем резервный..." : ""
  });
  pollImageJob(store, jobId, task.taskId, provider);
}

async function startFallbackImageTask(store, jobId, job, reason) {
  try {
    store.patchJob(jobId, {
      status: "running",
      stage: "image",
      progress: 20,
      failMsg: `${reason}. Переключаемся на резервный способ...`
    });
    await startImageTask(store, jobId, job, fallbackProvider, 26);
  } catch (error) {
    failImageJob(store, jobId, error.message || "Резервный способ не запустил генерацию");
  }
}

function failImageJob(store, jobId, message) {
  store.patchJob(jobId, {
    status: "failed",
    stage: "image",
    progress: 100,
    failMsg: message
  });
}

function findJob(store, jobId) {
  return store.getState().jobs.find((job) => job.id === jobId);
}

async function prepareAiBriefJob(store, jobId) {
  const state = store.getState();
  const currentJob = findJob(store, jobId);
  const context = getJobContext(state, currentJob);
  const existingJobs = state.jobs.filter((job) => job.projectId === context.project.id && job.id !== jobId);
  const aiBrief = await generateAiBrief({
    project: context.project,
    product: context.product,
    reference: context.reference,
    existingJobs,
    diversitySlot: currentJob?.diversitySlot
  });
  const humanizedBrief = await addHumanizedPlan({ context, aiBrief, existingJobs });
  const jobNext = {
    ...createGenerationJob({ ...context, generationBrief: humanizedBrief, existingJobs }),
    id: jobId,
    status: currentJob.status,
    stage: "prompt",
    progress: 16
  };
  store.replaceJob(jobId, jobNext);
  return jobNext;
}

function getJobContext(state, job) {
  if (!job) return getContext(state);
  const fallback = getContext(state);
  const project = state.projects.find((item) => item.id === job.projectId) || fallback.project;
  const product = state.products.find((item) => item.id === job.productId) || fallback.product;
  const reference = project.references.find((item) => item.title === job.referenceTitle) || fallback.reference || project.references[0];
  const character = project.characters.find((item) => item.id === job.characterId) || fallback.character || project.characters[0];
  const audio = state.audioLibrary.find((item) => item.title === job.music) || fallback.audio;
  return {
    ...fallback,
    project,
    product,
    reference,
    character,
    audio
  };
}

async function addHumanizedPlan({ context, aiBrief, existingJobs }) {
  const brief = createAutoGenerationBrief({ ...context, generationBrief: aiBrief, existingJobs });
  const plan = createSemanticPlan({ project: context.project, product: context.product, brief });
  try {
    const humanizedPlan = await humanizeGenerationPlan({
      project: context.project,
      product: context.product,
      brief,
      plan
    });
    return {
      ...aiBrief,
      aiPlan: humanizedPlan,
      notes: `${aiBrief.notes || ""} Humanizer AI: текст переписан простым массовым языком.`.trim()
    };
  } catch {
    return aiBrief;
  }
}

function delayImagePoll(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
