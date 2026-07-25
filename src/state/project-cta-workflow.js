import {
  approveCtaBadgeCandidate,
  attachCtaBadgeImage,
  attachCtaBadgeTask,
  createCtaBadgeCandidate,
  failCtaBadgeCandidate,
  normalizeCtaOverlay,
  resetCtaOverlay
} from "../domain/cta-overlay.js";
import { createImageTask, getImageTaskStatus } from "../services/kie-client.js";

export function createProjectCtaWorkflow({ getState, getProject, setState, saveProjectPatchRemote, isRemoteReady }) {
  return {
    updateProjectCtaOverlay(payload) {
      const state = getState();
      const project = getProject(state, state.selectedProjectId);
      if (!project) return;
      patchProject(project.id, (item) => ({
        ...item,
        ctaOverlay: normalizeCtaOverlay({ ...(item.ctaOverlay || {}), ...payload })
      }));
    },
    async createProjectCtaCandidate(payload) {
      const state = getState();
      const project = getProject(state, state.selectedProjectId);
      if (!project) return;
      let candidateId = "";
      patchProject(project.id, (item) => {
        const ctaOverlay = normalizeCtaOverlay({ ...(item.ctaOverlay || {}), ...payload });
        const candidate = createCtaBadgeCandidate(ctaOverlay);
        candidateId = candidate.id;
        return { ...item, ctaOverlay: { ...ctaOverlay, mode: "badge", candidate } };
      });
      const candidate = getProjectCtaCandidate(project.id);
      if (!candidate) return;
      try {
        const result = await createImageTask(candidate.finalPrompt, [], "gpt-image-2", [], {
          aspectRatio: "1:1",
          resolution: "1K",
          outputFormat: "png"
        });
        patchProjectCtaCandidate(project.id, candidateId, (item) => attachCtaBadgeTask(item, result.taskId));
        pollProjectCtaCandidate(project.id, candidateId, result.taskId);
      } catch (error) {
        patchProjectCtaCandidate(project.id, candidateId, (item) => failCtaBadgeCandidate(item, error.message || "Kie.ai badge image request failed"));
      }
    },
    approveProjectCtaCandidate() {
      const state = getState();
      const project = getProject(state, state.selectedProjectId);
      if (!project) return;
      patchProject(project.id, (item) => ({
        ...item,
        ctaOverlay: approveCtaBadgeCandidate(item.ctaOverlay)
      }));
    },
    resetProjectCtaOverlay() {
      const state = getState();
      const project = getProject(state, state.selectedProjectId);
      if (!project) return;
      patchProject(project.id, (item) => ({
        ...item,
        ctaOverlay: resetCtaOverlay()
      }));
    },
    updateProjectCtaOverlayRemote(payload) {
      const state = getState();
      const project = getProject(state, state.selectedProjectId);
      if (!project) return null;
      const ctaOverlay = normalizeCtaOverlay({ ...(project.ctaOverlay || {}), ...payload });
      return commitProjectCtaOverlay(project.id, ctaOverlay, {
        kind: "project-cta-overlay",
        resourceName: "cta-overlay",
        label: "Сохраняем плашку"
      });
    },
    async createProjectCtaCandidateRemote(payload) {
      const state = getState();
      const project = getProject(state, state.selectedProjectId);
      if (!project) return null;
      const ctaOverlay = normalizeCtaOverlay({ ...(project.ctaOverlay || {}), ...payload });
      const candidate = createCtaBadgeCandidate(ctaOverlay);
      await commitProjectCtaOverlay(project.id, { ...ctaOverlay, mode: "badge", candidate }, {
        kind: "project-cta-candidate",
        resourceName: "cta-overlay",
        label: "Создаем AI-плашку"
      });
      try {
        const result = await createImageTask(candidate.finalPrompt, [], "gpt-image-2", [], {
          aspectRatio: "1:1",
          resolution: "1K",
          outputFormat: "png"
        });
        await patchProjectCtaCandidateRemote(project.id, candidate.id, (item) => attachCtaBadgeTask(item, result.taskId));
        pollProjectCtaCandidate(project.id, candidate.id, result.taskId, 0, true);
      } catch (error) {
        await patchProjectCtaCandidateRemote(project.id, candidate.id, (item) => failCtaBadgeCandidate(item, error.message || "Kie.ai badge image request failed"));
      }
      return candidate;
    },
    approveProjectCtaCandidateRemote() {
      const state = getState();
      const project = getProject(state, state.selectedProjectId);
      if (!project) return null;
      return commitProjectCtaOverlay(project.id, approveCtaBadgeCandidate(project.ctaOverlay), {
        kind: "project-cta-approve",
        resourceName: "cta-overlay",
        label: "Апрувим плашку"
      });
    },
    resetProjectCtaOverlayRemote() {
      const state = getState();
      const project = getProject(state, state.selectedProjectId);
      if (!project) return null;
      return commitProjectCtaOverlay(project.id, resetCtaOverlay(), {
        kind: "project-cta-reset",
        resourceName: "cta-overlay",
        label: "Сбрасываем плашку"
      });
    },
    resumeProjectCtaPolling(project) {
      const projects = project ? [project] : getState().projects;
      projects
        .filter((item) => item.ctaOverlay?.candidate?.taskId && item.ctaOverlay.candidate.status === "generating")
        .forEach((item) => pollProjectCtaCandidate(item.id, item.ctaOverlay.candidate.id, item.ctaOverlay.candidate.taskId));
    }
  };

  function patchProject(projectId, updater) {
    setState({
      projects: getState().projects.map((item) => item.id === projectId ? updater(item) : item)
    });
  }

  function patchProjectCtaCandidate(projectId, candidateId, updater) {
    patchProject(projectId, (project) => {
      const ctaOverlay = normalizeCtaOverlay(project.ctaOverlay);
      if (ctaOverlay.candidate?.id !== candidateId) return project;
      return { ...project, ctaOverlay: { ...ctaOverlay, candidate: updater(ctaOverlay.candidate) } };
    });
  }

  function commitProjectCtaOverlay(projectId, ctaOverlay, operation) {
    if (typeof saveProjectPatchRemote === "function" && isRemoteReady?.()) {
      return saveProjectPatchRemote(projectId, { ctaOverlay: normalizeCtaOverlay(ctaOverlay) }, operation);
    }
    patchProject(projectId, (item) => ({ ...item, ctaOverlay: normalizeCtaOverlay(ctaOverlay) }));
    return getState().projects.find((item) => item.id === projectId) || null;
  }

  function patchProjectCtaCandidateRemote(projectId, candidateId, updater) {
    const project = getState().projects.find((item) => item.id === projectId);
    if (!project) return null;
    const ctaOverlay = normalizeCtaOverlay(project.ctaOverlay);
    if (ctaOverlay.candidate?.id !== candidateId) return project;
    return commitProjectCtaOverlay(projectId, {
      ...ctaOverlay,
      candidate: updater(ctaOverlay.candidate)
    }, {
      kind: "project-cta-candidate-status",
      resourceName: "cta-overlay",
      label: "Обновляем AI-плашку"
    });
  }

  function getProjectCtaCandidate(projectId) {
    return getState().projects.find((item) => item.id === projectId)?.ctaOverlay?.candidate || null;
  }

  async function pollProjectCtaCandidate(projectId, candidateId, taskId, attempt = 0, remote = false) {
    if (attempt >= 75) {
      await patchCtaCandidate(projectId, candidateId, remote, (item) => failCtaBadgeCandidate(item, "Kie.ai не вернул плашку за 5 минут. Попробуйте еще раз."));
      return;
    }

    await delayProjectCtaPoll(attempt === 0 ? 6000 : 4000);

    const candidate = getProjectCtaCandidate(projectId);
    if (!candidate || candidate.id !== candidateId || candidate.status === "review" || candidate.status === "failed") return;

    try {
      const status = await getImageTaskStatus(taskId);
      if (["success", "succeeded", "completed", "complete"].includes(status.state) && status.imageUrl) {
        await patchCtaCandidate(projectId, candidateId, remote, (item) => attachCtaBadgeImage(item, status.imageUrl));
        return;
      }
      if (["fail", "failed", "error"].includes(status.state)) {
        await patchCtaCandidate(projectId, candidateId, remote, (item) => failCtaBadgeCandidate(item, status.failMsg || "Kie.ai badge image generation failed"));
        return;
      }
      pollProjectCtaCandidate(projectId, candidateId, taskId, attempt + 1, remote);
    } catch (error) {
      await patchCtaCandidate(projectId, candidateId, remote, (item) => failCtaBadgeCandidate(item, error.message || "Kie.ai badge image status request failed"));
    }
  }

  function patchCtaCandidate(projectId, candidateId, remote, updater) {
    return remote
      ? patchProjectCtaCandidateRemote(projectId, candidateId, updater)
      : patchProjectCtaCandidate(projectId, candidateId, updater);
  }
}

function delayProjectCtaPoll(timeout) {
  return new Promise((resolve) => setTimeout(resolve, timeout));
}
