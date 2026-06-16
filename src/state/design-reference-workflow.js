import {
  approveDesignReferenceCandidate,
  attachDesignReferenceCandidateTask,
  createDesignReferenceCandidate,
  updateDesignReferenceCandidate
} from "../domain/design-reference-candidate.js";
import { createImageTask, getImageTaskStatus } from "../services/kie-client.js";

export function createDesignReferenceWorkflow({ getState, setState, getProject }) {
  return {
    async createDesignReferenceTemplate(payload) {
      const state = getState();
      const project = getProject(state, state.selectedProjectId);
      const candidate = createDesignReferenceCandidate(project, payload);
      setState({
        projects: state.projects.map((item) =>
          item.id === project.id
            ? { ...item, designReferenceCandidates: [candidate, ...(item.designReferenceCandidates || [])] }
            : item
        )
      });

      try {
        const result = await createImageTask(candidate.finalPrompt, [], "gpt-image-2", []);
        patchDesignReferenceCandidate(candidate.id, (item) => attachDesignReferenceCandidateTask(item, result.taskId));
        pollDesignReferenceCandidate(candidate.id, result.taskId);
      } catch (error) {
        patchDesignReferenceCandidate(candidate.id, (item) => failDesignReferenceItem(item, error, "Design reference request failed"));
      }
    },
    approveDesignReference(candidateId) {
      const state = getState();
      const project = getProject(state, state.selectedProjectId);
      const candidate = (project.designReferenceCandidates || []).find((item) => item.id === candidateId);
      if (!candidate?.imageData) return;
      const reference = approveDesignReferenceCandidate(candidate);
      setState({
        projects: state.projects.map((item) =>
          item.id === project.id
            ? {
                ...item,
                references: [reference, ...item.references],
                designReferenceCandidates: (item.designReferenceCandidates || []).filter((candidate) => candidate.id !== candidateId)
              }
            : item
        ),
        selectedReferenceId: reference.id
      });
    },
    rejectDesignReference(candidateId) {
      const state = getState();
      const project = getProject(state, state.selectedProjectId);
      setState({
        projects: state.projects.map((item) =>
          item.id === project.id
            ? { ...item, designReferenceCandidates: (item.designReferenceCandidates || []).filter((candidate) => candidate.id !== candidateId) }
            : item
        )
      });
    },
    resumeDesignReferencePolling() {
      const state = getState();
      state.projects.forEach((project) => {
        (project.designReferenceCandidates || [])
          .filter((candidate) => candidate.taskId && ["waiting", "generating"].includes(candidate.status))
          .forEach((candidate) => pollDesignReferenceCandidate(candidate.id, candidate.taskId));
      });
    }
  };

  function patchDesignReferenceCandidate(candidateId, updater) {
    const state = getState();
    setState({
      projects: state.projects.map((project) =>
        (project.designReferenceCandidates || []).some((candidate) => candidate.id === candidateId)
          ? {
              ...project,
              designReferenceCandidates: (project.designReferenceCandidates || []).map((candidate) =>
                candidate.id === candidateId ? updater(candidate) : candidate
              )
            }
          : project
      )
    });
  }

  async function pollDesignReferenceCandidate(candidateId, taskId, attempt = 0) {
    if (attempt >= 75) {
      patchDesignReferenceCandidate(candidateId, (item) => ({
        ...item,
        status: "failed",
        failMsg: "Kie.ai не вернул дизайн-шаблон за 5 минут. Попробуйте еще раз."
      }));
      return;
    }

    await delayDesignReferencePoll(attempt === 0 ? 6000 : 4000);

    const state = getState();
    const candidate = findDesignReferenceCandidate(state, candidateId);
    if (!candidate || candidate.status === "review" || candidate.status === "failed") return;

    try {
      const status = await getImageTaskStatus(taskId);
      patchDesignReferenceCandidate(candidateId, (item) => updateDesignReferenceCandidate(item, status));
      if (!["success", "succeeded", "completed", "complete", "fail", "failed", "error"].includes(status.state)) {
        pollDesignReferenceCandidate(candidateId, taskId, attempt + 1);
      }
    } catch (error) {
      patchDesignReferenceCandidate(candidateId, (item) => failDesignReferenceItem(item, error, "Design reference status request failed"));
    }
  }
}

function findDesignReferenceCandidate(state, candidateId) {
  for (const project of state.projects || []) {
    const candidate = (project.designReferenceCandidates || []).find((item) => item.id === candidateId);
    if (candidate) return candidate;
  }
  return null;
}

function failDesignReferenceItem(item, error, fallback) {
  return { ...item, status: "failed", failMsg: error.message || fallback };
}

function delayDesignReferencePoll(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
