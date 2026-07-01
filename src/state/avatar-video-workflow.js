import {
  attachAvatarChromaImage,
  attachAvatarChromaImageTask,
  attachAvatarAlphaVideo,
  attachAvatarVideoTask,
  createAvatarVideoRecord,
  markAvatarAlphaConnectionRecovering,
  markAvatarVideoConnectionRecovering,
  updateAvatarVideoName,
  updateAvatarVideoRecord
} from "../domain/avatar-video.js";
import {
  approveCtaBadgeCandidate,
  attachCtaBadgeImage,
  attachCtaBadgeTask,
  createCtaBadgeCandidate,
  failCtaBadgeCandidate,
  normalizeCtaOverlay,
  resetCtaOverlay
} from "../domain/cta-overlay.js";
import {
  createAvatarAlphaVideo,
  createAvatarVideoTask,
  createImageTask,
  getAvatarVideoTaskStatus,
  getImageTaskStatus,
  isKieConnectionError
} from "../services/kie-client.js";

const RECOVERABLE_POLL_MESSAGE = "Связь со студией прервалась, но задача сохранена. Продолжаем проверять статус автоматически...";
const RECOVERABLE_ALPHA_MESSAGE = "Видео готово. Связь с обработчиком прозрачности прервалась, пробуем продолжить автоматически...";
const MAX_RECOVERABLE_POLLS = 180;
const MAX_ALPHA_RECOVERIES = 20;

export function createAvatarVideoWorkflow({ getState, getProject, patchCharacter, addProjectAvatarVideo }) {
  const activePolls = new Set();
  const activeAlphaConversions = new Set();

  return {
    async createAvatarVideo(payload) {
      const state = getState();
      const project = getProject(state, state.selectedProjectId);
      const character = project.characters.find((item) => item.id === state.selectedCharacterId) || project.characters[0];
      if (!character) return;

      const video = createAvatarVideoRecord(character, payload);
      addProjectAvatarVideo(character.id, video);
      if (!character.imageData) {
        patchAvatarVideo(character.id, video.id, (item) => ({
          ...item,
          status: "failed",
          failMsg: "У активного аватара нет изображения. Сначала сгенерируйте и одобрите аватар."
        }));
        return;
      }

      try {
        const imageResult = await createImageTask(video.imagePrompt, [character.imageData], "gpt-image-2", [{
          role: "avatar",
          title: character.name || "Активный аватар",
          isLocalData: /^data:image\//i.test(String(character.imageData || ""))
        }]);
        patchAvatarVideo(character.id, video.id, (item) => attachAvatarChromaImageTask(item, imageResult.taskId));
        scheduleAvatarChromaImagePoll(character.id, video.id, imageResult.taskId);
      } catch (error) {
        patchAvatarVideo(character.id, video.id, (item) => failAvatarVideoItem(item, error, "Kie.ai chroma image request failed"));
      }
    },
    updateAvatarVideoOverlay(videoId, payload) {
      const state = getState();
      const project = getProject(state, state.selectedProjectId);
      const character = project.characters.find((item) => item.id === state.selectedCharacterId) || project.characters[0];
      if (!character) return;
      patchAvatarVideo(character.id, videoId, (item) => ({
        ...item,
        overlay: normalizeAvatarVideoOverlay({ ...(item.overlay || {}), ...payload })
      }));
    },
    updateAvatarVideoCtaOverlay(videoId, payload) {
      const state = getState();
      const project = getProject(state, state.selectedProjectId);
      const character = project.characters.find((item) => item.id === state.selectedCharacterId) || project.characters[0];
      if (!character) return;
      patchAvatarVideo(character.id, videoId, (item) => ({
        ...item,
        ctaOverlay: normalizeCtaOverlay({ ...(item.ctaOverlay || {}), ...payload })
      }));
    },
    async createAvatarVideoCtaCandidate(videoId, payload) {
      const state = getState();
      const project = getProject(state, state.selectedProjectId);
      const character = project.characters.find((item) => item.id === state.selectedCharacterId) || project.characters[0];
      if (!character) return;
      let candidateId = "";
      patchAvatarVideo(character.id, videoId, (item) => {
        const ctaOverlay = normalizeCtaOverlay({ ...(item.ctaOverlay || {}), ...payload });
        const candidate = createCtaBadgeCandidate(ctaOverlay);
        candidateId = candidate.id;
        return { ...item, ctaOverlay: { ...ctaOverlay, mode: "badge", candidate } };
      });
      const candidate = getCharacterVideo(character.id, videoId)?.ctaOverlay?.candidate;
      if (!candidate) return;
      try {
        const result = await createImageTask(candidate.finalPrompt, [], "gpt-image-2", [], {
          aspectRatio: "1:1",
          resolution: "1K",
          outputFormat: "png"
        });
        patchCtaCandidate(character.id, videoId, candidateId, (item) => attachCtaBadgeTask(item, result.taskId));
        pollCtaBadgeImage(character.id, videoId, candidateId, result.taskId);
      } catch (error) {
        patchCtaCandidate(character.id, videoId, candidateId, (item) => failCtaBadgeCandidate(item, error.message || "Kie.ai badge image request failed"));
      }
    },
    approveAvatarVideoCtaCandidate(videoId) {
      const state = getState();
      const project = getProject(state, state.selectedProjectId);
      const character = project.characters.find((item) => item.id === state.selectedCharacterId) || project.characters[0];
      if (!character) return;
      patchAvatarVideo(character.id, videoId, (item) => ({
        ...item,
        ctaOverlay: approveCtaBadgeCandidate(item.ctaOverlay)
      }));
    },
    resetAvatarVideoCtaOverlay(videoId) {
      const state = getState();
      const project = getProject(state, state.selectedProjectId);
      const character = project.characters.find((item) => item.id === state.selectedCharacterId) || project.characters[0];
      if (!character) return;
      patchAvatarVideo(character.id, videoId, (item) => ({
        ...item,
        ctaOverlay: resetCtaOverlay()
      }));
    },
    setAvatarVideoActive(videoId, isActive) {
      const state = getState();
      const project = getProject(state, state.selectedProjectId);
      const character = project.characters.find((item) =>
        (item.avatarVideos || []).some((video) => video.id === videoId)
      );
      if (!character) return;
      patchAvatarVideo(character.id, videoId, (item) => ({ ...item, isActive: Boolean(isActive) }));
    },
    updateAvatarVideoName(videoId, name) {
      const state = getState();
      const project = getProject(state, state.selectedProjectId);
      const character = project.characters.find((item) => (item.avatarVideos || []).some((video) => video.id === videoId));
      if (!character) return;
      patchAvatarVideo(character.id, videoId, (item) => updateAvatarVideoName(item, name));
    },
    resumeAvatarVideoPolling(project) {
      const projects = project ? [project] : getState().projects;
      projects.forEach((item) => item.characters.forEach((character) => {
        (character.avatarVideos || [])
          .filter((video) => video.imageTaskId && ["preparing-image", "generating-image"].includes(video.status))
          .forEach((video) => scheduleAvatarChromaImagePoll(character.id, video.id, video.imageTaskId));
        (character.avatarVideos || [])
          .filter((video) => video.chromaImageUrl && video.status === "submitting-video" && !video.taskId)
          .forEach((video) => startAvatarVideoFromChromaImage(character.id, video.id, video.chromaImageUrl));
        (character.avatarVideos || [])
          .filter((video) => video.status === "preparing-image" && !video.imageTaskId)
          .forEach((video) => patchAvatarVideo(character.id, video.id, (item) => ({
            ...item,
            status: "failed",
            failMsg: "Подготовка хромакей-кадра прервалась обновлением страницы. Запустите видео заново."
          })));
        (character.avatarVideos || [])
          .filter((video) => video.taskId && ["waiting", "generating"].includes(video.status))
          .forEach((video) => scheduleAvatarVideoPoll(character.id, video.id, video.taskId));
        (character.avatarVideos || [])
          .filter((video) => video.videoUrl && video.alphaStatus === "converting")
          .forEach((video) => scheduleAvatarAlphaConversion(character.id, video.id, video.videoUrl, video.alphaRecoveryCount || 0));
        (character.avatarVideos || [])
          .filter((video) => video.ctaOverlay?.candidate?.taskId && video.ctaOverlay.candidate.status === "generating")
          .forEach((video) => pollCtaBadgeImage(character.id, video.id, video.ctaOverlay.candidate.id, video.ctaOverlay.candidate.taskId));
      }));
    }
  };

  function patchAvatarVideo(characterId, videoId, updater) {
    patchCharacter(characterId, (character) => ({
      ...character,
      avatarVideos: (character.avatarVideos || []).map((video) => video.id === videoId ? updater(video) : video)
    }));
  }

  function patchCtaCandidate(characterId, videoId, candidateId, updater) {
    patchAvatarVideo(characterId, videoId, (video) => {
      const ctaOverlay = normalizeCtaOverlay(video.ctaOverlay);
      if (ctaOverlay.candidate?.id !== candidateId) return video;
      return { ...video, ctaOverlay: { ...ctaOverlay, candidate: updater(ctaOverlay.candidate) } };
    });
  }

  async function pollAvatarChromaImage(characterId, videoId, taskId, attempt = 0) {
    const pollKey = `image:${videoId}:${taskId}`;
    if (activePolls.has(pollKey)) return;
    activePolls.add(pollKey);
    try {
      await runAvatarChromaImagePoll(characterId, videoId, taskId, attempt);
    } finally {
      activePolls.delete(pollKey);
    }
  }

  async function runAvatarChromaImagePoll(characterId, videoId, taskId, attempt = 0) {
    if (attempt >= MAX_RECOVERABLE_POLLS) {
      patchAvatarVideo(characterId, videoId, (item) => ({ ...item, status: "failed", failMsg: "Kie.ai не вернул хромакей-кадр за 12 минут. Попробуйте еще раз." }));
      return;
    }

    await delayAvatarVideoPoll(attempt === 0 ? 6000 : 4000);

    const video = getCharacterVideo(characterId, videoId);
    if (!video || video.status === "ready" || video.status === "failed" || video.chromaImageUrl) return;

    try {
      const status = await getImageTaskStatus(taskId);
      if (["success", "succeeded", "completed", "complete"].includes(status.state) && status.imageUrl) {
        patchAvatarVideo(characterId, videoId, (item) => attachAvatarChromaImage(item, status.imageUrl));
        await startAvatarVideoFromChromaImage(characterId, videoId, status.imageUrl);
        return;
      }
      if (["fail", "failed", "error"].includes(status.state)) {
        patchAvatarVideo(characterId, videoId, (item) => ({ ...item, status: "failed", failMsg: status.failMsg || "Kie.ai chroma image generation failed" }));
        return;
      }
      patchAvatarVideo(characterId, videoId, (item) => ({ ...item, status: "generating-image" }));
      scheduleAvatarChromaImagePoll(characterId, videoId, taskId, attempt + 1);
    } catch (error) {
      if (isRecoverablePollingError(error, attempt)) {
        patchAvatarVideo(characterId, videoId, (item) => markAvatarVideoConnectionRecovering(item, RECOVERABLE_POLL_MESSAGE));
        scheduleAvatarChromaImagePoll(characterId, videoId, taskId, attempt + 1);
        return;
      }
      patchAvatarVideo(characterId, videoId, (item) => failAvatarVideoItem(item, error, "Kie.ai chroma image status request failed"));
    }
  }

  async function startAvatarVideoFromChromaImage(characterId, videoId, imageUrl) {
    const video = getCharacterVideo(characterId, videoId);
    if (!video) return;
    try {
      const result = await createAvatarVideoTask({ imageUrl, prompt: video.finalPrompt });
      patchAvatarVideo(characterId, videoId, (item) => attachAvatarVideoTask(item, result.taskId));
      scheduleAvatarVideoPoll(characterId, videoId, result.taskId);
    } catch (error) {
      patchAvatarVideo(characterId, videoId, (item) => failAvatarVideoItem(item, error, "Kie.ai video request failed"));
    }
  }

  async function pollCtaBadgeImage(characterId, videoId, candidateId, taskId, attempt = 0) {
    if (attempt >= 75) {
      patchCtaCandidate(characterId, videoId, candidateId, (item) => failCtaBadgeCandidate(item, "Kie.ai не вернул плашку за 5 минут. Попробуйте еще раз."));
      return;
    }

    await delayAvatarVideoPoll(attempt === 0 ? 6000 : 4000);

    const candidate = getCharacterVideo(characterId, videoId)?.ctaOverlay?.candidate;
    if (!candidate || candidate.id !== candidateId || candidate.status === "review" || candidate.status === "failed") return;

    try {
      const status = await getImageTaskStatus(taskId);
      if (["success", "succeeded", "completed", "complete"].includes(status.state) && status.imageUrl) {
        patchCtaCandidate(characterId, videoId, candidateId, (item) => attachCtaBadgeImage(item, status.imageUrl));
        return;
      }
      if (["fail", "failed", "error"].includes(status.state)) {
        patchCtaCandidate(characterId, videoId, candidateId, (item) => failCtaBadgeCandidate(item, status.failMsg || "Kie.ai badge image generation failed"));
        return;
      }
      pollCtaBadgeImage(characterId, videoId, candidateId, taskId, attempt + 1);
    } catch (error) {
      patchCtaCandidate(characterId, videoId, candidateId, (item) => failCtaBadgeCandidate(item, error.message || "Kie.ai badge image status request failed"));
    }
  }

  async function pollAvatarVideo(characterId, videoId, taskId, attempt = 0) {
    const pollKey = `video:${videoId}:${taskId}`;
    if (activePolls.has(pollKey)) return;
    activePolls.add(pollKey);
    try {
      await runAvatarVideoPoll(characterId, videoId, taskId, attempt);
    } finally {
      activePolls.delete(pollKey);
    }
  }

  async function runAvatarVideoPoll(characterId, videoId, taskId, attempt = 0) {
    if (attempt >= MAX_RECOVERABLE_POLLS) {
      patchAvatarVideo(characterId, videoId, (item) => ({ ...item, status: "failed", failMsg: "Kie.ai не вернул видео за 12 минут. Попробуйте еще раз." }));
      return;
    }

    await delayAvatarVideoPoll(attempt === 0 ? 6000 : 4000);

    const video = getCharacterVideo(characterId, videoId);
    if (!video || video.status === "ready" || video.status === "failed") return;

    try {
      const status = await getAvatarVideoTaskStatus(taskId);
      const isSuccess = ["success", "succeeded", "completed", "complete"].includes(status.state) && status.videoUrl;
      patchAvatarVideo(characterId, videoId, (item) => updateAvatarVideoRecord(item, status));
      if (isSuccess) {
        await convertAvatarAlphaVideo(characterId, videoId, status.videoUrl);
        return;
      }
      if (status.state !== "fail" && status.state !== "failed") {
        scheduleAvatarVideoPoll(characterId, videoId, taskId, attempt + 1);
      }
    } catch (error) {
      if (isRecoverablePollingError(error, attempt)) {
        patchAvatarVideo(characterId, videoId, (item) => markAvatarVideoConnectionRecovering(item, RECOVERABLE_POLL_MESSAGE));
        scheduleAvatarVideoPoll(characterId, videoId, taskId, attempt + 1);
        return;
      }
      patchAvatarVideo(characterId, videoId, (item) => failAvatarVideoItem(item, error, "Kie.ai video status request failed"));
    }
  }

  function getCharacterVideo(characterId, videoId) {
    const state = getState();
    for (const project of state.projects || []) {
      const character = project.characters.find((item) => item.id === characterId);
      const video = (character?.avatarVideos || []).find((item) => item.id === videoId);
      if (video) return video;
    }
    return null;
  }

  async function convertAvatarAlphaVideo(characterId, videoId, videoUrl, attempt = 0) {
    const conversionKey = `alpha:${videoId}:${videoUrl}`;
    if (activeAlphaConversions.has(conversionKey)) return;
    activeAlphaConversions.add(conversionKey);
    try {
      await runAvatarAlphaVideoConversion(characterId, videoId, videoUrl, attempt);
    } finally {
      activeAlphaConversions.delete(conversionKey);
    }
  }

  async function runAvatarAlphaVideoConversion(characterId, videoId, videoUrl, attempt = 0) {
    const video = getCharacterVideo(characterId, videoId);
    if (!video || video.alphaVideoUrl || video.alphaStatus === "ready") return;
    patchAvatarVideo(characterId, videoId, (item) => ({ ...item, alphaStatus: "converting", alphaFailMsg: "" }));

    try {
      const result = await createAvatarAlphaVideo(videoUrl);
      patchAvatarVideo(characterId, videoId, (item) => attachAvatarAlphaVideo(item, result.alphaVideoUrl));
    } catch (error) {
      if (isKieConnectionError(error) && attempt < MAX_ALPHA_RECOVERIES) {
        patchAvatarVideo(characterId, videoId, (item) => markAvatarAlphaConnectionRecovering(item, RECOVERABLE_ALPHA_MESSAGE));
        await delayAvatarVideoPoll(getRecoverableDelay(attempt));
        scheduleAvatarAlphaConversion(characterId, videoId, videoUrl, attempt + 1);
        return;
      }
      patchAvatarVideo(characterId, videoId, (item) => ({
        ...item,
        alphaStatus: "failed",
        alphaFailMsg: error.message || "Не удалось удалить хромакей"
      }));
    }
  }

  function scheduleAvatarChromaImagePoll(characterId, videoId, taskId, attempt = 0) {
    setTimeout(() => pollAvatarChromaImage(characterId, videoId, taskId, attempt), 0);
  }

  function scheduleAvatarVideoPoll(characterId, videoId, taskId, attempt = 0) {
    setTimeout(() => pollAvatarVideo(characterId, videoId, taskId, attempt), 0);
  }

  function scheduleAvatarAlphaConversion(characterId, videoId, videoUrl, attempt = 0) {
    setTimeout(() => convertAvatarAlphaVideo(characterId, videoId, videoUrl, attempt), 0);
  }

}

function isRecoverablePollingError(error, attempt) {
  return isKieConnectionError(error) && attempt < MAX_RECOVERABLE_POLLS;
}

function getRecoverableDelay(attempt) {
  return Math.min(30000, 2000 + (Math.max(0, attempt) * 2000));
}

function failAvatarVideoItem(item, error, fallback) {
  return { ...item, status: "failed", failMsg: error.message || fallback };
}

function delayAvatarVideoPoll(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeAvatarVideoOverlay(payload = {}) {
  return {
    x: clampAvatarVideoOverlayNumber(payload.x, 50, 15, 85),
    y: clampAvatarVideoOverlayNumber(payload.y, 98, 45, 100),
    scale: clampAvatarVideoOverlayNumber(payload.scale, 96, 35, 150),
    opacity: clampAvatarVideoOverlayNumber(payload.opacity, 100, 30, 100)
  };
}

function clampAvatarVideoOverlayNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}
