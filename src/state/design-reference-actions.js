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
  isRemoteReady,
  scheduleFallbackSave,
  runScopedOperation
}) {
  function createReference(payload) {
    const project = getSelectedProject();
    const reference = createReferenceEntity(payload);
    const remote = shouldUseRemote();
    applyCreatedReference(project.id, reference, remote ? { skipRemoteSave: true } : {});
    if (!remote) return Promise.resolve(reference);
    return runReferenceOperation(project.id, {
      kind: "create",
      targetId: reference.id,
      label: "Сохраняем референс",
      activeStatus: "saving"
    }, () => syncAfterOptimistic(
      () => createRemoteDesignReference(project.id, reference, getRemoteUpdatedAt?.() || ""),
      { projectId: project.id, optimisticValue: reference, optimisticReferenceId: reference.id }
    ));
  }

  function updateSelectedDesignReference(payload = {}) {
    const { project, reference } = getSelectedReferenceContext();
    if (!project || !reference) return Promise.resolve(null);
    const analysisOnly = payload.designAnalysis && Object.keys(payload).length === 1;
    return updateReferenceById(project.id, reference.id, payload, {
      kind: analysisOnly ? "analysis" : "update",
      label: analysisOnly ? "Анализируем референс" : "Сохраняем изменения",
      activeStatus: analysisOnly ? "analyzing" : "saving"
    });
  }

  function replaceDesignReference(referenceId, payload = {}) {
    const project = getSelectedProject();
    const reference = (project.references || []).find((item) => item.id === referenceId);
    if (!reference) return Promise.resolve(null);
    return updateReferenceById(project.id, reference.id, {
      ...payload,
      designAnalysis: null
    }, {
      kind: "replace",
      label: "Заменяем референс",
      activeStatus: "saving"
    });
  }

  function updateReferenceById(projectId, referenceId, payload = {}, operation = {}) {
    const project = getProject(getState(), projectId);
    const reference = (project.references || []).find((item) => item.id === referenceId);
    if (!project || !reference) return Promise.resolve(null);
    const updated = createReferenceEntity({ ...reference, ...payload, id: reference.id, type: reference.type });
    const remote = shouldUseRemote();
    applyUpdatedReference(projectId, updated, remote ? { skipRemoteSave: true } : {});
    if (!remote) return Promise.resolve(updated);
    return runReferenceOperation(projectId, {
      kind: operation.kind || "update",
      targetId: referenceId,
      label: operation.label || "Сохраняем изменения",
      activeStatus: operation.activeStatus || "saving"
    }, () => syncAfterOptimistic(
      () => updateRemoteDesignReference(projectId, updated.id, payload, getRemoteUpdatedAt?.() || ""),
      { projectId, optimisticValue: updated, optimisticReferenceId: updated.id }
    ));
  }

  function deleteReference(referenceId) {
    const project = getSelectedProject();
    const deletion = buildReferenceDeletion(project.id, referenceId);
    if (!deletion) return Promise.resolve(null);
    const remote = shouldUseRemote();
    applyProjectDesignState(deletion.project.id, {
      references: deletion.references,
      selectedReferenceId: deletion.selectedReferenceId
    }, remote ? { skipRemoteSave: true } : {});
    if (!remote) return Promise.resolve(deletion);
    return runReferenceOperation(project.id, {
      kind: "delete",
      targetId: referenceId,
      label: "Удаляем референс",
      activeStatus: "deleting"
    }, () => syncAfterOptimistic(
      () => deleteRemoteDesignReference(deletion.project.id, referenceId, getRemoteUpdatedAt?.() || ""),
      { projectId: deletion.project.id, optimisticValue: deletion, optimisticReferenceId: referenceId }
    ));
  }

  function approveDesignReference(candidateId) {
    const project = getSelectedProject();
    const approval = buildCandidateApproval(project.id, candidateId);
    if (!approval) return Promise.resolve(null);
    const remote = shouldUseRemote();
    applyProjectDesignState(approval.project.id, {
      references: [approval.reference, ...(approval.project.references || [])],
      designReferenceCandidates: (approval.project.designReferenceCandidates || []).filter((candidate) => candidate.id !== candidateId),
      selectedReferenceId: approval.reference.id
    }, remote ? { skipRemoteSave: true } : {});
    if (!remote) return Promise.resolve(approval.reference);
    return runReferenceOperation(project.id, {
      kind: "approve",
      targetId: candidateId,
      label: "Одобряем дизайн-шаблон",
      activeStatus: "saving"
    }, () => syncAfterOptimistic(
      () => approveRemoteDesignReferenceCandidate(approval.project.id, candidateId, getRemoteUpdatedAt?.() || ""),
      { projectId: approval.project.id, optimisticValue: approval.reference, optimisticReferenceId: approval.reference.id }
    ));
  }

  function rejectDesignReference(candidateId) {
    const project = getSelectedProject();
    const rejection = buildCandidateRejection(project.id, candidateId);
    if (!rejection) return Promise.resolve(null);
    const remote = shouldUseRemote();
    applyProjectDesignState(rejection.project.id, { designReferenceCandidates: rejection.candidates }, remote ? { skipRemoteSave: true } : {});
    if (!remote) return Promise.resolve(rejection);
    return runReferenceOperation(project.id, {
      kind: "reject",
      targetId: candidateId,
      label: "Отклоняем дизайн-шаблон",
      activeStatus: "saving"
    }, () => syncAfterOptimistic(
      () => rejectRemoteDesignReferenceCandidate(rejection.project.id, candidateId, getRemoteUpdatedAt?.() || ""),
      { projectId: rejection.project.id, optimisticValue: rejection, optimisticReferenceId: "" }
    ));
  }

  return {
    createReference,
    replaceDesignReference,
    updateDesignReference: updateReferenceById,
    updateSelectedDesignReference,
    deleteReference,
    approveDesignReference,
    rejectDesignReference
  };

  function shouldUseRemote() {
    return Boolean(isRemoteReady?.());
  }

  async function syncAfterOptimistic(request, { projectId, optimisticValue, optimisticReferenceId }) {
    try {
      const result = await request();
      if (result.disabled) return fallbackToFullState(optimisticValue);
      applyRemoteResult(projectId, result, optimisticReferenceId);
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

  function applyRemoteResult(projectId, result, optimisticReferenceId) {
    if (result.project) {
      applyRemoteProject(result.project, result.reference?.id || optimisticReferenceId);
      return;
    }
    if (result.references) {
      applyProjectDesignState(projectId, {
        references: result.references,
        selectedReferenceId: getNextSelectedReferenceId(result.references, result.reference?.id || getState().selectedReferenceId)
      }, { skipRemoteSave: true });
      return;
    }
    if (result.reference) applyReferenceReplacement(projectId, optimisticReferenceId, result.reference);
    if (result.candidates) applyProjectDesignState(projectId, { designReferenceCandidates: result.candidates }, { skipRemoteSave: true });
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

  function applyReferenceReplacement(projectId, oldReferenceId, reference) {
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

  function buildReferenceDeletion(projectId, referenceId) {
    const project = getProject(getState(), projectId);
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

  function buildCandidateApproval(projectId, candidateId) {
    const project = getProject(getState(), projectId);
    const candidate = (project.designReferenceCandidates || []).find((item) => item.id === candidateId);
    if (!candidate?.imageData) return null;
    return { project, reference: approveDesignReferenceCandidate(candidate) };
  }

  function buildCandidateRejection(projectId, candidateId) {
    const project = getProject(getState(), projectId);
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

  function runReferenceOperation(projectId, operation, task) {
    if (!runScopedOperation) return task();
    return runScopedOperation({
      scope: `design-references:${projectId}`,
      key: `design-reference:${projectId}:${operation.kind}:${operation.targetId}`,
      ...operation
    }, task);
  }
}

function getNextSelectedReferenceId(references, preferredReferenceId) {
  if (references.some((reference) => reference.id === preferredReferenceId)) return preferredReferenceId;
  return references[0]?.id;
}
