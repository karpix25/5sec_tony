import { approveDesignReferenceCandidate } from "../domain/design-reference-candidate.js";
import {
  approveRemoteDesignReferenceCandidate,
  createRemoteDesignReference,
  deleteRemoteDesignReference,
  rejectRemoteDesignReferenceCandidate,
  updateRemoteDesignReference
} from "../services/design-references-sync.js";
import { isTransientFetchError } from "../services/sync-fetch.js";
import { createReferenceEntity } from "./factories.js";

export function createDesignReferenceActions({
  getState,
  setState,
  getProject,
  recordRemoteSave,
  getRemoteUpdatedAt,
  handleRemoteConflict,
  hasPendingRemoteSave,
  isRemoteReady,
  scheduleFallbackSave
}) {
  function createReference(payload) {
    const project = getSelectedProject();
    const reference = createReferenceEntity(payload);
    const remote = shouldUseRemote();
    applyCreatedReference(project.id, reference, remote ? { skipRemoteSave: true } : {});
    if (!remote) return Promise.resolve(reference);
    return syncAfterOptimistic(
      () => createRemoteDesignReference(project.id, reference, getRemoteUpdatedAt?.() || ""),
      { optimisticValue: reference, optimisticReferenceId: reference.id }
    );
  }

  function updateSelectedDesignReference(payload = {}) {
    const { project, reference } = getSelectedReferenceContext();
    if (!project || !reference) return Promise.resolve(null);
    const updated = createReferenceEntity({ ...reference, ...payload, id: reference.id, type: reference.type });
    const remote = shouldUseRemote();
    applyUpdatedReference(project.id, updated, remote ? { skipRemoteSave: true } : {});
    if (!remote) return Promise.resolve(updated);
    return syncAfterOptimistic(
      () => updateRemoteDesignReference(project.id, updated.id, payload, getRemoteUpdatedAt?.() || ""),
      { optimisticValue: updated, optimisticReferenceId: updated.id }
    );
  }

  function deleteReference(referenceId) {
    const deletion = buildReferenceDeletion(referenceId);
    if (!deletion) return Promise.resolve(null);
    const remote = shouldUseRemote();
    applyProjectDesignState(deletion.project.id, {
      references: deletion.references,
      selectedReferenceId: deletion.selectedReferenceId
    }, remote ? { skipRemoteSave: true } : {});
    if (!remote) return Promise.resolve(deletion);
    return syncAfterOptimistic(
      () => deleteRemoteDesignReference(deletion.project.id, referenceId, getRemoteUpdatedAt?.() || ""),
      { optimisticValue: deletion, optimisticReferenceId: referenceId }
    );
  }

  function approveDesignReference(candidateId) {
    const approval = buildCandidateApproval(candidateId);
    if (!approval) return Promise.resolve(null);
    const remote = shouldUseRemote();
    applyProjectDesignState(approval.project.id, {
      references: [approval.reference, ...(approval.project.references || [])],
      designReferenceCandidates: (approval.project.designReferenceCandidates || []).filter((candidate) => candidate.id !== candidateId),
      selectedReferenceId: approval.reference.id
    }, remote ? { skipRemoteSave: true } : {});
    if (!remote) return Promise.resolve(approval.reference);
    return syncAfterOptimistic(
      () => approveRemoteDesignReferenceCandidate(approval.project.id, candidateId, getRemoteUpdatedAt?.() || ""),
      { optimisticValue: approval.reference, optimisticReferenceId: approval.reference.id }
    );
  }

  function rejectDesignReference(candidateId) {
    const rejection = buildCandidateRejection(candidateId);
    if (!rejection) return Promise.resolve(null);
    const remote = shouldUseRemote();
    applyProjectDesignState(rejection.project.id, { designReferenceCandidates: rejection.candidates }, remote ? { skipRemoteSave: true } : {});
    if (!remote) return Promise.resolve(rejection);
    return syncAfterOptimistic(
      () => rejectRemoteDesignReferenceCandidate(rejection.project.id, candidateId, getRemoteUpdatedAt?.() || ""),
      { optimisticValue: rejection, optimisticReferenceId: "" }
    );
  }

  return {
    createReference,
    updateSelectedDesignReference,
    deleteReference,
    approveDesignReference,
    rejectDesignReference
  };

  function shouldUseRemote() {
    return Boolean(isRemoteReady?.()) && !hasPendingRemoteSave?.();
  }

  async function syncAfterOptimistic(request, { optimisticValue, optimisticReferenceId }) {
    try {
      const result = await request();
      if (result.disabled) return fallbackToFullState(optimisticValue);
      applyRemoteResult(result, optimisticReferenceId);
      recordRemoteSave?.(getState(), result.updatedAt);
      return result.reference || result.project || optimisticValue;
    } catch (error) {
      if (error?.conflict) {
        await handleRemoteConflict?.(error);
        throw error;
      }
      if (!error?.endpointUnavailable && !isTransientFetchError(error)) {
        console.warn("[design-reference:sync:fallback]", error.message || error);
      }
      return fallbackToFullState(optimisticValue);
    }
  }

  function fallbackToFullState(value) {
    scheduleFallbackSave?.();
    return value;
  }

  function applyRemoteResult(result, optimisticReferenceId) {
    if (result.project) {
      applyRemoteProject(result.project, result.reference?.id || optimisticReferenceId);
      return;
    }
    const project = getSelectedProject();
    if (result.references) {
      applyProjectDesignState(project.id, {
        references: result.references,
        selectedReferenceId: getNextSelectedReferenceId(result.references, result.reference?.id || getState().selectedReferenceId)
      }, { skipRemoteSave: true });
      return;
    }
    if (result.reference) replaceReference(project.id, optimisticReferenceId, result.reference);
    if (result.candidates) applyProjectDesignState(project.id, { designReferenceCandidates: result.candidates }, { skipRemoteSave: true });
  }

  function applyRemoteProject(project, preferredReferenceId) {
    setState({
      projects: getState().projects.map((item) => item.id === project.id ? project : item),
      selectedReferenceId: getNextSelectedReferenceId(project.references || [], preferredReferenceId)
    }, { skipRemoteSave: true });
  }

  function applyCreatedReference(projectId, reference, options = {}) {
    applyProjectDesignState(projectId, {
      references: [reference, ...(getProject(getState(), projectId).references || []).filter((item) => item.id !== reference.id)],
      selectedReferenceId: reference.id
    }, options);
  }

  function applyUpdatedReference(projectId, reference, options = {}) {
    applyProjectDesignState(projectId, {
      references: (getProject(getState(), projectId).references || []).map((item) => item.id === reference.id ? reference : item),
      selectedReferenceId: reference.id
    }, options);
  }

  function replaceReference(projectId, oldReferenceId, reference) {
    const selectedReferenceId = getState().selectedReferenceId === oldReferenceId ? reference.id : getState().selectedReferenceId;
    applyProjectDesignState(projectId, {
      references: (getProject(getState(), projectId).references || []).map((item) => item.id === oldReferenceId ? reference : item),
      selectedReferenceId
    }, { skipRemoteSave: true });
  }

  function applyProjectDesignState(projectId, patch, options = {}) {
    const { selectedReferenceId, ...projectPatch } = patch;
    const state = getState();
    setState({
      projects: state.projects.map((project) => project.id === projectId ? { ...project, ...projectPatch } : project),
      ...(selectedReferenceId !== undefined ? { selectedReferenceId } : {})
    }, options);
  }

  function buildReferenceDeletion(referenceId) {
    const project = getSelectedProject();
    const references = (project.references || []).filter((reference) => reference.id !== referenceId);
    if ((project.references || []).length <= 1 || references.length === (project.references || []).length) return null;
    return {
      project,
      references,
      selectedReferenceId: references.some((reference) => reference.id === getState().selectedReferenceId)
        ? getState().selectedReferenceId
        : references[0]?.id
    };
  }

  function buildCandidateApproval(candidateId) {
    const project = getSelectedProject();
    const candidate = (project.designReferenceCandidates || []).find((item) => item.id === candidateId);
    if (!candidate?.imageData) return null;
    return { project, reference: approveDesignReferenceCandidate(candidate) };
  }

  function buildCandidateRejection(candidateId) {
    const project = getSelectedProject();
    const candidates = (project.designReferenceCandidates || []).filter((candidate) => candidate.id !== candidateId);
    return candidates.length === (project.designReferenceCandidates || []).length ? null : { project, candidates };
  }

  function getSelectedReferenceContext() {
    const project = getSelectedProject();
    return {
      project,
      reference: (project.references || []).find((reference) => reference.id === getState().selectedReferenceId)
    };
  }

  function getSelectedProject() {
    const state = getState();
    return getProject(state, state.selectedProjectId);
  }
}

function getNextSelectedReferenceId(references, preferredReferenceId) {
  if (references.some((reference) => reference.id === preferredReferenceId)) return preferredReferenceId;
  return references[0]?.id;
}
