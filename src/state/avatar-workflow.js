import { approveAvatarCandidate, attachAvatarTask, createAvatarCandidate, updateAvatarCandidate } from "../domain/avatar.js";
import { createAvatarTask, getAvatarTaskStatus } from "../services/kie-client.js";
import { createAvatarVideoWorkflow } from "./avatar-video-workflow.js";

export function createAvatarWorkflow({ getState, setState, getProject }) {
  const avatarVideoWorkflow = createAvatarVideoWorkflow({ getState, getProject, patchCharacter, replaceProjectAvatarVideo });

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
    createAvatarVideo: avatarVideoWorkflow.createAvatarVideo,
    updateAvatarVideoOverlay: avatarVideoWorkflow.updateAvatarVideoOverlay,
    resumeAvatarPolling() {
      const state = getState();
      const project = getProject(state, state.selectedProjectId);
      (project.avatarCandidates || [])
        .filter((candidate) => candidate.taskId && ["waiting", "generating"].includes(candidate.status))
        .forEach((candidate) => pollAvatar(candidate.id, candidate.taskId));
      avatarVideoWorkflow.resumeAvatarVideoPolling(project);
    }
  };

  function patchAvatarCandidate(candidateId, updater) {
    const state = getState();
    setState({
      projects: state.projects.map((project) =>
        project.id === state.selectedProjectId
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
        project.id === state.selectedProjectId
          ? { ...project, characters: project.characters.map((character) => character.id === characterId ? updater(character) : character) }
          : project
      )
    });
  }

  function replaceProjectAvatarVideo(characterId, video) {
    const state = getState();
    setState({
      projects: state.projects.map((project) =>
        project.id === state.selectedProjectId
          ? {
              ...project,
              characters: project.characters.map((character) => ({
                ...character,
                avatarVideos: character.id === characterId ? [video] : []
              }))
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
    const project = getProject(state, state.selectedProjectId);
    const candidate = (project.avatarCandidates || []).find((item) => item.id === candidateId);
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

function failItem(item, error, fallback) {
  return { ...item, status: "failed", failMsg: error.message || fallback };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
