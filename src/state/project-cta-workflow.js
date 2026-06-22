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

export function createProjectCtaWorkflow({ getState, getProject, setState }) {
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

  function getProjectCtaCandidate(projectId) {
    return getState().projects.find((item) => item.id === projectId)?.ctaOverlay?.candidate || null;
  }

  async function pollProjectCtaCandidate(projectId, candidateId, taskId, attempt = 0) {
    if (attempt >= 75) {
      patchProjectCtaCandidate(projectId, candidateId, (item) => failCtaBadgeCandidate(item, "Kie.ai не вернул плашку за 5 минут. Попробуйте еще раз."));
      return;
    }

    await delayProjectCtaPoll(attempt === 0 ? 6000 : 4000);

    const candidate = getProjectCtaCandidate(projectId);
    if (!candidate || candidate.id !== candidateId || candidate.status === "review" || candidate.status === "failed") return;

    try {
      const status = await getImageTaskStatus(taskId);
      if (["success", "succeeded", "completed", "complete"].includes(status.state) && status.imageUrl) {
        patchProjectCtaCandidate(projectId, candidateId, (item) => attachCtaBadgeImage(item, status.imageUrl));
        return;
      }
      if (["fail", "failed", "error"].includes(status.state)) {
        patchProjectCtaCandidate(projectId, candidateId, (item) => failCtaBadgeCandidate(item, status.failMsg || "Kie.ai badge image generation failed"));
        return;
      }
      pollProjectCtaCandidate(projectId, candidateId, taskId, attempt + 1);
    } catch (error) {
      patchProjectCtaCandidate(projectId, candidateId, (item) => failCtaBadgeCandidate(item, error.message || "Kie.ai badge image status request failed"));
    }
  }
}

function delayProjectCtaPoll(timeout) {
  return new Promise((resolve) => setTimeout(resolve, timeout));
}
