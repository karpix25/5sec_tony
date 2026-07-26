import { getServerImageJobStatus, runServerImageJob } from "../services/server-jobs.js";

const terminalStatuses = ["done", "review", "failed"];
const activeServerPolls = new Set();
const appliedAvatarUsage = new Set();

export async function runImageJob(store, jobId) {
  const job = findJob(store, jobId);
  if (!job) return;

  store.patchJob(jobId, {
    status: "running",
    stage: "image",
    progress: Math.max(12, Number(job.progress || 0)),
    failMsg: "Передали генерацию серверу..."
  }, { skipRemoteSave: true });

  try {
    const currentJob = findJob(store, jobId) || job;
    const payload = await runServerImageJob({
      job: currentJob,
      context: createServerJobContext(store, currentJob)
    });
    applyServerJobPayload(store, payload);
    if (!isTerminalJob(payload.job)) {
      pollServerImageJob(store, jobId);
    }
  } catch (error) {
    failServerJob(store, jobId, error.message || "Не удалось запустить серверную генерацию");
  }
}

export function resumeRunningImageJobs(store) {
  const resume = () => {
    return syncRunningImageJobs(store);
  };
  return typeof store.whenHydrated === "function"
    ? Promise.resolve(store.whenHydrated()).then(resume)
    : resume();
}

export function syncRunningImageJobs(store) {
  const jobs = store.getState().jobs.filter(shouldPollServerJob);
  return Promise.all(jobs.map((job) => pollServerImageJob(store, job.id, { immediate: true })));
}

async function pollServerImageJob(store, jobId, options = {}) {
  if (activeServerPolls.has(jobId)) return Promise.resolve();
  activeServerPolls.add(jobId);
  try {
    let immediate = Boolean(options.immediate);
    for (let attempt = 0; attempt < 150; attempt += 1) {
      if (!immediate) await delayServerStatusPoll(attempt === 0 ? 1600 : 3000);
      immediate = false;

      const localJob = findJob(store, jobId);
      if (!localJob || terminalStatuses.includes(localJob.status)) return;

      try {
        const payload = await getServerImageJobStatus(jobId);
        applyServerJobPayload(store, payload);
        if (isTerminalJob(payload.job)) return;
      } catch (error) {
        if (isServerJobMissing(error)) {
          failServerJob(store, jobId, "Серверная задача не найдена. Запустите генерацию заново.");
          return;
        }
        store.patchJob(jobId, {
          failMsg: "Не удалось прочитать статус сервера, пробуем еще раз..."
        }, { skipRemoteSave: true });
      }
    }
    failServerJob(store, jobId, "Сервер слишком долго не вернул результат. Проверьте задачу и запустите заново.");
  } finally {
    activeServerPolls.delete(jobId);
  }
}

function applyServerJobPayload(store, payload) {
  if (!payload?.job?.id) return;
  store.patchJob(payload.job.id, payload.job, { skipRemoteSave: true });
  applyAvatarUsage(store, payload.job.id, payload.avatarUsage);
}

function applyAvatarUsage(store, jobId, usage) {
  if (!usage?.characterId || !usage?.videoId || typeof store.markAvatarVideoUsed !== "function") return;
  const key = `${jobId}:${usage.characterId}:${usage.videoId}`;
  if (appliedAvatarUsage.has(key)) return;
  appliedAvatarUsage.add(key);
  store.markAvatarVideoUsed(usage.characterId, usage.videoId, usage.nextIndex, usage.nextCharacterIndex);
}

function createServerJobContext(store, job) {
  const state = store.getState();
  const project = state.projects?.find((item) => item.id === job.projectId) || null;
  const product = state.products?.find((item) => item.id === job.productId) || null;
  return {
    project,
    product,
    audioLibrary: state.audioLibrary || [],
    selectedAudioId: state.selectedAudioId || "",
    selectedCharacterId: state.selectedCharacterId || ""
  };
}

function isTerminalJob(job) {
  return job?.status && terminalStatuses.includes(job.status);
}

function isServerJobMissing(error) {
  return /server job not found|Серверная задача не найдена/i.test(error?.message || "");
}

function hasServerJobHandshake(job) {
  return Boolean(job?.serverJobAcceptedAt || job?.imageTaskId || job?.imageProvider || job?.finalVideoUrl || job?.imageUrl);
}

function shouldPollServerJob(job) {
  return job?.status === "running" && hasServerJobHandshake(job);
}

function failServerJob(store, jobId, message) {
  store.patchJob(jobId, {
    status: "failed",
    stage: "image",
    progress: 100,
    failMsg: message
  }, { skipRemoteSave: true });
}

function findJob(store, jobId) {
  return store.getState().jobs.find((job) => job.id === jobId);
}

function delayServerStatusPoll(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
