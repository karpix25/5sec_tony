import { approveAvatarCandidate, attachAvatarTask, createAvatarCandidate, updateAvatarCandidate } from "../domain/avatar.js";
import { createAvatarTask, getAvatarTaskStatus } from "../services/kie-client.js";
import { createAvatarVideoWorkflow } from "./avatar-video-workflow.js";

export function createAvatarWorkflow({ getState, setState, getProject }) {
  const avatarVideoWorkflow = createAvatarVideoWorkflow({ getState, getProject, patchCharacter, addProjectAvatarVideo });

  return {
    async createCharacter(payload) {
      const state = getState();
      const project = getProject(state, state.selectedProjectId);
      const candidate = createAvatarCandidate(project, payload);
      setState({
        projects: state.projects.map((item) =>
          item.id === project.id ? { ...item, avatarCandidates: [candidate, ...(item.avatarCandidates || [])] } : item
        )
      });

      try {
        const result = await createAvatarTask(candidate.finalPrompt);
        patchAvatarCandidate(candidate.id, (item) => attachAvatarTask(item, result.taskId));
        pollAvatar(candidate.id, result.taskId);
      } catch (error) {
        patchAvatarCandidate(candidate.id, (item) => failItem(item, error, "Kie.ai request failed"));
      }
    },
    approveAvatar(candidateId) {
      const state = getState();
      const project = getProject(state, state.selectedProjectId);
      const candidate = (project.avatarCandidates || []).find((item) => item.id === candidateId);
      if (!candidate?.imageData) return;
      const character = approveAvatarCandidate(project.id, candidate);
      setState({
        projects: state.projects.map((item) =>
          item.id === project.id
            ? {
                ...item,
                characters: [character, ...item.characters],
                avatarCandidates: (item.avatarCandidates || []).filter((avatar) => avatar.id !== candidateId)
              }
            : item
        ),
        selectedCharacterId: character.id
      });
    },
    rejectAvatar(candidateId) {
      const state = getState();
      const project = getProject(state, state.selectedProjectId);
      setState({
        projects: state.projects.map((item) =>
          item.id === project.id
            ? { ...item, avatarCandidates: (item.avatarCandidates || []).filter((avatar) => avatar.id !== candidateId) }
            : item
        )
      });
    },
    deleteCharacter(characterId) {
      const state = getState();
      const project = getProject(state, state.selectedProjectId);
      if (project.characters.length <= 1) return;
      setState({
        projects: state.projects.map((item) =>
          item.id === project.id
            ? { ...item, characters: item.characters.filter((character) => character.id !== characterId) }
          : item
        )
      });
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
    setAvatarVideoActive: avatarVideoWorkflow.setAvatarVideoActive,
    markAvatarVideoUsed(characterId, videoId, nextIndex, nextCharacterIndex) {
      const state = getState();
      const nextProjectIndex = Math.max(0, Math.round(Number(nextCharacterIndex) || 0));
      setState({
        projects: state.projects.map((project) =>
          project.characters.some((character) => character.id === characterId)
            ? {
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
              }
            : project
        )
      });
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
    setState({
      projects: state.projects.map((project) =>
        (project.avatarCandidates || []).some((candidate) => candidate.id === candidateId)
          ? {
              ...project,
              avatarCandidates: (project.avatarCandidates || []).map((candidate) =>
                candidate.id === candidateId ? updater(candidate) : candidate
              )
            }
          : project
      )
    });
  }

  function patchCharacter(characterId, updater) {
    const state = getState();
    setState({
      projects: state.projects.map((project) =>
        project.characters.some((character) => character.id === characterId)
          ? { ...project, characters: project.characters.map((character) => character.id === characterId ? updater(character) : character) }
          : project
      )
    });
  }

  function addProjectAvatarVideo(characterId, video) {
    const state = getState();
    setState({
      projects: state.projects.map((project) =>
        project.characters.some((character) => character.id === characterId)
          ? {
              ...project,
              characters: project.characters.map((character) =>
                character.id === characterId
                  ? { ...character, avatarVideos: [video, ...(character.avatarVideos || [])] }
                  : character
              )
            }
          : project
      )
    });
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
