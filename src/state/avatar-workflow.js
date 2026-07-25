import {
  approveAvatarCandidate,
  attachAvatarTask,
  createAvatarCandidate,
  createUploadedAvatarCharacter,
  updateAvatarCandidate
} from "../domain/avatar.js";
import { createAvatarTask, getAvatarTaskStatus } from "../services/kie-client.js";
import { createAvatarVideoWorkflow } from "./avatar-video-workflow.js";

export function createAvatarWorkflow({ getState, setState, getProject, saveProjectPatchRemote, isRemoteReady }) {
  const avatarVideoWorkflow = createAvatarVideoWorkflow({ getState, getProject, patchCharacter, addProjectAvatarVideo, saveProjectPatchRemote });

  return {
    async createCharacter(payload) {
      const state = getState();
      const project = getProject(state, state.selectedProjectId);
      const candidate = createAvatarCandidate(project, payload);
      commitAvatarProject(project.id, (item) => ({
        ...item,
        avatarCandidates: [candidate, ...(item.avatarCandidates || [])]
      }), { kind: "avatar-candidate-create", label: "Создаем аватар" });

      try {
        const result = await createAvatarTask(candidate.finalPrompt);
        patchAvatarCandidate(candidate.id, (item) => attachAvatarTask(item, result.taskId));
        pollAvatar(candidate.id, result.taskId);
      } catch (error) {
        patchAvatarCandidate(candidate.id, (item) => failItem(item, error, "Kie.ai request failed"));
      }
    },
    uploadCharacter(payload) {
      if (!payload?.imageData) return;
      const state = getState();
      const project = getProject(state, state.selectedProjectId);
      const character = createUploadedAvatarCharacter(project.id, payload);
      commitAvatarProject(project.id, (item) => ({
        ...item,
        characters: [character, ...item.characters]
      }), { kind: "avatar-upload", label: "Сохраняем аватар" }, { selectedCharacterId: character.id });
    },
    approveAvatar(candidateId) {
      const state = getState();
      const project = getProject(state, state.selectedProjectId);
      const candidate = (project.avatarCandidates || []).find((item) => item.id === candidateId);
      if (!candidate?.imageData) return;
      const character = approveAvatarCandidate(project.id, candidate);
      commitAvatarProject(project.id, (item) => ({
        ...item,
        characters: [character, ...item.characters],
        avatarCandidates: (item.avatarCandidates || []).filter((avatar) => avatar.id !== candidateId)
      }), { kind: "avatar-approve", label: "Апрувим аватар" }, { selectedCharacterId: character.id });
    },
    rejectAvatar(candidateId) {
      const state = getState();
      const project = getProject(state, state.selectedProjectId);
      commitAvatarProject(project.id, (item) => ({
        ...item,
        avatarCandidates: (item.avatarCandidates || []).filter((avatar) => avatar.id !== candidateId)
      }), { kind: "avatar-reject", label: "Удаляем кандидата" });
    },
    deleteCharacter(characterId) {
      const state = getState();
      const project = getProject(state, state.selectedProjectId);
      if (project.characters.length <= 1) return;
      commitAvatarProject(project.id, (item) => ({
        ...item,
        characters: item.characters.filter((character) => character.id !== characterId)
      }), { kind: "avatar-delete", label: "Удаляем аватар" });
    },
    setCharacterActive(characterId, isActive) {
      patchCharacter(characterId, (character) => ({
        ...character,
        isActive: Boolean(isActive)
      }));
    },
    createAvatarVideo: avatarVideoWorkflow.createAvatarVideo,
    updateAvatarVideoOverlay: avatarVideoWorkflow.updateAvatarVideoOverlay,
    updateAvatarVideoCtaOverlay: avatarVideoWorkflow.updateAvatarVideoCtaOverlay,
    createAvatarVideoCtaCandidate: avatarVideoWorkflow.createAvatarVideoCtaCandidate,
    approveAvatarVideoCtaCandidate: avatarVideoWorkflow.approveAvatarVideoCtaCandidate,
    resetAvatarVideoCtaOverlay: avatarVideoWorkflow.resetAvatarVideoCtaOverlay,
    setAvatarVideoActive: avatarVideoWorkflow.setAvatarVideoActive,
    updateAvatarVideoName: avatarVideoWorkflow.updateAvatarVideoName,
    markAvatarVideoUsed(characterId, videoId, nextIndex, nextCharacterIndex) {
      const state = getState();
      const nextProjectIndex = Math.max(0, Math.round(Number(nextCharacterIndex) || 0));
      commitAvatarProjectWhere(
        (project) => project.characters.some((character) => character.id === characterId),
        (project) => ({
          ...project,
          avatarRoundRobinIndex: nextProjectIndex,
          characters: project.characters.map((character) =>
            character.id === characterId
              ? {
                  ...character,
                  avatarVideoRoundRobinIndex: Math.max(0, Math.round(Number(nextIndex) || 0)),
                  avatarVideos: (character.avatarVideos || []).map((video) =>
                    video.id === videoId ? { ...video, lastUsedAt: new Date().toISOString() } : video
                  )
                }
              : character
          )
        }),
        { kind: "avatar-rotation", label: "Обновляем ротацию аватаров" }
      );
    },
    resumeAvatarPolling() {
      const state = getState();
      state.projects.forEach((project) => {
        (project.avatarCandidates || [])
          .filter((candidate) => candidate.taskId && ["waiting", "generating"].includes(candidate.status))
          .forEach((candidate) => pollAvatar(candidate.id, candidate.taskId));
      });
      avatarVideoWorkflow.resumeAvatarVideoPolling();
    }
  };

  function patchAvatarCandidate(candidateId, updater) {
    const state = getState();
    commitAvatarProjectWhere(
      (project) => (project.avatarCandidates || []).some((candidate) => candidate.id === candidateId),
      (project) => ({
        ...project,
        avatarCandidates: (project.avatarCandidates || []).map((candidate) =>
          candidate.id === candidateId ? updater(candidate) : candidate
        )
      }),
      { kind: "avatar-candidate-status", label: "Обновляем аватар" }
    );
  }

  function patchCharacter(characterId, updater) {
    commitAvatarProjectWhere(
      (project) => project.characters.some((character) => character.id === characterId),
      (project) => ({
        ...project,
        characters: project.characters.map((character) => character.id === characterId ? updater(character) : character)
      }),
      { kind: "avatar-character-update", label: "Сохраняем аватар" }
    );
  }

  function addProjectAvatarVideo(characterId, video) {
    commitAvatarProjectWhere(
      (project) => project.characters.some((character) => character.id === characterId),
      (project) => ({
        ...project,
        characters: project.characters.map((character) =>
          character.id === characterId
            ? { ...character, avatarVideos: [video, ...(character.avatarVideos || [])] }
            : character
        )
      }),
      { kind: "avatar-video-create", label: "Создаем видео аватара" }
    );
  }

  async function pollAvatar(candidateId, taskId, attempt = 0) {
    if (attempt >= 75) {
      patchAvatarCandidate(candidateId, (item) => ({ ...item, status: "failed", failMsg: "Kie.ai не вернул результат за 5 минут. Попробуйте еще раз." }));
      return;
    }

    await delay(attempt === 0 ? 6000 : 4000);

    const state = getState();
    const candidate = findAvatarCandidate(state, candidateId);
    if (!candidate || candidate.status === "review" || candidate.status === "failed") return;

    try {
      const status = await getAvatarTaskStatus(taskId);
      patchAvatarCandidate(candidateId, (item) => updateAvatarCandidate(item, status));
      if (status.state !== "success" && status.state !== "fail") pollAvatar(candidateId, taskId, attempt + 1);
    } catch (error) {
      patchAvatarCandidate(candidateId, (item) => failItem(item, error, "Kie.ai status request failed"));
    }
  }

  function commitAvatarProject(projectId, updater, operation, extraPatch = {}) {
    return commitAvatarProjectWhere((project) => project.id === projectId, updater, operation, extraPatch);
  }

  function commitAvatarProjectWhere(predicate, updater, operation, extraPatch = {}) {
    let nextProject = null;
    const remote = typeof saveProjectPatchRemote === "function" && isRemoteReady?.();
    setState({
      projects: getState().projects.map((project) => {
        if (!predicate(project)) return project;
        nextProject = updater(project);
        return nextProject;
      }),
      ...extraPatch
    }, { skipRemoteSave: remote });
    if (remote && nextProject) {
      saveProjectPatchRemote(nextProject.id, pickAvatarProjectPatch(nextProject), {
        resourceName: "avatars",
        ...operation
      }).catch((error) => console.warn("[avatar:remote-save]", error));
    }
    return nextProject;
  }

}

function pickAvatarProjectPatch(project) {
  return {
    avatarCandidates: project.avatarCandidates || [],
    characters: project.characters || [],
    avatarRoundRobinIndex: project.avatarRoundRobinIndex || 0
  };
}

function findAvatarCandidate(state, candidateId) {
  for (const project of state.projects || []) {
    const candidate = (project.avatarCandidates || []).find((item) => item.id === candidateId);
    if (candidate) return candidate;
  }
  return null;
}

function failItem(item, error, fallback) {
  return { ...item, status: "failed", failMsg: error.message || fallback };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
