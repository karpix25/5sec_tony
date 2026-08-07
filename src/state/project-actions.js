import { createDailyUsageDate } from "../domain/daily-usage.js";
import { getProductsForProject } from "../domain/generation.js";
import { noAvatarCharacterId } from "../domain/avatar-selection.js";
import { normalizeProjectAutomation } from "../domain/project-automation.js";
import { generateProjectStrategyField } from "../domain/project-strategy.js";
import {
  createRemoteProject,
  deleteRemoteProject,
  loadRemoteProject,
  updateRemoteProject,
  updateRemoteProjectResource
} from "../services/projects-sync.js";
import { isTransientFetchError } from "../services/sync-fetch.js";
import { ensureGenerationBrief } from "./factories.js";
import { createProjectBundle } from "./project-creation.js";
import { updateProjectEntity } from "./store-projects.js";

export function createProjectActions({
  getState,
  setState,
  getProject,
  getRemoteUpdatedAt,
  handleRemoteConflict,
  recordRemoteSave,
  runScopedOperation
}) {
  function updateProjectSettings(payload) {
    const state = getState();
    setState({
      projects: state.projects.map((project) =>
        project.id === state.selectedProjectId ? updateProjectEntity(project, payload) : project
      )
    });
  }

  function updateProjectSettingsRemote(payload, options = {}) {
    const projectId = getState().selectedProjectId;
    return runProjectOperation({
      scope: `project:${projectId}`,
      key: `project:${projectId}:update`,
      kind: "update",
      targetId: projectId,
      label: "Сохраняем проект"
    }, async () => {
      const state = getState();
      const currentProject = getProject(state, projectId);
      const project = updateProjectEntity(currentProject, preserveConcurrentFields(currentProject, payload, options));
      try {
        const result = await updateRemoteProject(project.id, project, getRemoteUpdatedAt?.() || "", {
          projectLimitBase: getProjectLimitBase(currentProject, options)
        });
        if (result.disabled) return applyLocalProjectUpdate(payload, project);
        setState({
          projects: getState().projects.map((item) => item.id === project.id ? (result.project || project) : item)
        }, { skipRemoteSave: true });
        recordRemoteSave?.(getState(), result.updatedAt, result.refreshUpdatedAt, result.catalogUpdatedAt);
        return result.project || project;
      } catch (error) {
        if (error?.conflict) {
          const retried = await retryProjectUpdateAfterConflict({ error, payload, projectId, options });
          if (retried) return retried;
          await handleRemoteConflict?.(error);
        }
        throw error;
      }
    });
  }

  function updateProjectPatchRemote(projectId, patch, operation = {}) {
    return runProjectOperation({
      scope: `project:${projectId}`,
      key: `project:${projectId}:${operation.kind || "patch"}`,
      kind: operation.kind || "patch",
      targetId: projectId,
      label: operation.label || "Сохраняем проект",
      activeStatus: operation.activeStatus || "saving"
    }, async () => {
      const state = getState();
      const currentProject = getProject(state, projectId);
      const project = { ...currentProject, ...patch };
      try {
        const result = operation.resourceName
          ? await updateRemoteProjectResource(project.id, operation.resourceName, patch, getRemoteUpdatedAt?.() || "")
          : await updateRemoteProject(project.id, patch, getRemoteUpdatedAt?.() || "", {
              projectLimitBase: currentProject?.projectLimit
            });
        if (result.disabled) return applyLocalProjectPatch(projectId, patch, project);
        setState({
          projects: getState().projects.map((item) => item.id === project.id ? (result.project || project) : item)
        }, { skipRemoteSave: true });
        recordRemoteSave?.(getState(), result.updatedAt, result.refreshUpdatedAt, result.catalogUpdatedAt);
        return result.project || project;
      } catch (error) {
        if (error?.conflict) {
          const retried = await retryProjectPatchAfterConflict({ error, projectId, patch, resourceName: operation.resourceName });
          if (retried) return retried;
          await handleRemoteConflict?.(error);
        }
        throw error;
      }
    });
  }

  function updateProjectAutomation(projectId, payload) {
    const state = getState();
    setState({
      projects: state.projects.map((project) =>
        project.id === projectId
          ? { ...project, automation: normalizeProjectAutomation({ ...(project.automation || {}), ...payload }) }
          : project
      )
    });
  }

  function updateProjectAutomationRemote(projectId, payload) {
    const state = getState();
    const project = getProject(state, projectId);
    const automation = normalizeProjectAutomation({ ...(project.automation || {}), ...payload });
    return updateProjectPatchRemote(projectId, { automation }, {
      kind: "automation",
      resourceName: "automation",
      label: "Сохраняем авторежим"
    });
  }

  function resetProjectDailyUsage(projectId = getState().selectedProjectId) {
    const state = getState();
    setState({
      projects: state.projects.map((project) =>
        project.id === projectId ? { ...project, usedToday: 0, dailyUsageDate: createDailyUsageDate() } : project
      )
    });
  }

  function resetProjectDailyUsageRemote(projectId = getState().selectedProjectId) {
    return updateProjectPatchRemote(projectId, {
      usedToday: 0,
      dailyUsageDate: createDailyUsageDate()
    }, {
      kind: "reset-daily-usage",
      resourceName: "usage",
      label: "Сбрасываем дневной лимит"
    });
  }

  function resetProjectTotalUsage(projectId = getState().selectedProjectId) {
    const state = getState();
    setState({
      projects: state.projects.map((project) => project.id === projectId ? { ...project, usedTotal: 0 } : project)
    });
  }

  function resetProjectTotalUsageRemote(projectId = getState().selectedProjectId) {
    return updateProjectPatchRemote(projectId, { usedTotal: 0 }, {
      kind: "reset-total-usage",
      resourceName: "usage",
      label: "Сбрасываем общий лимит"
    });
  }

  function generateProjectField(fieldName, formPayload) {
    const state = getState();
    const project = updateProjectEntity(getProject(state, state.selectedProjectId), formPayload);
    const projectProducts = getProductsForProject(state.products, state.selectedProjectId);
    const value = generateProjectStrategyField(project, projectProducts, fieldName);
    setState({
      projects: state.projects.map((item) =>
        item.id === state.selectedProjectId ? updateProjectEntity(item, { ...formPayload, [fieldName]: value }) : item
      )
    });
  }

  function createProject(payload) {
    const state = getState();
    const { project, product } = createProjectBundle(payload);
    applyCreatedProject({ state, project, product });
  }

  function createProjectRemote(payload) {
    const bundle = createProjectBundle(payload);
    const previousState = getState();
    applyCreatedProject({ state: previousState, ...bundle }, { skipRemoteSave: true });
    return runProjectOperation({
      scope: "projects",
      key: `projects:create:${bundle.project.id}`,
      kind: "create",
      targetId: bundle.project.id,
      label: "Создаем проект"
    }, async () => {
      let result;
      try {
        result = await createRemoteProject(bundle, getRemoteUpdatedAt?.() || "");
      } catch (error) {
        if (error?.conflict) await handleRemoteConflict?.(error);
        if (!error?.conflict && isTransientFetchError(error)) {
          const recoveredProject = await recoverCreatedProject(bundle);
          if (recoveredProject) return recoveredProject;
        }
        rollbackCreatedProject(bundle, previousState);
        throw error;
      }
      if (result.disabled) {
        return bundle.project;
      }
      const project = result.project || bundle.project;
      const product = result.product || bundle.product;
      applyCreatedProject({ state: getState(), project, product }, { skipRemoteSave: true });
      recordRemoteSave?.(getState(), result.updatedAt, result.refreshUpdatedAt, result.catalogUpdatedAt);
      return project;
    });
  }

  async function recoverCreatedProject(bundle) {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      try {
        const result = await loadRemoteProject(bundle.project.id);
        if (result.disabled || !result.project) return null;
        const project = result.project;
        const product = result.product || bundle.product;
        applyCreatedProject({ state: getState(), project, product }, { skipRemoteSave: true });
        recordRemoteSave?.(getState(), result.updatedAt, result.refreshUpdatedAt, result.catalogUpdatedAt);
        return project;
      } catch (error) {
        if (error?.status !== 404 && !isTransientFetchError(error)) return null;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return null;
  }

  function deleteProject(projectId) {
    const state = getState();
    if (state.projects.length <= 1) return null;
    const deletedProductIds = state.products.filter((product) => product.projectId === projectId).map((product) => product.id);
    applyProjectDeletion(projectId, {
      deletedProjectIds: appendUniqueIds(state.deletedProjectIds, [projectId]),
      deletedProductIds: appendUniqueIds(state.deletedProductIds, deletedProductIds)
    });
    return { deletedProjectId: projectId };
  }

  function deleteProjectRemote(projectId) {
    if (getState().projects.length <= 1) return Promise.resolve(null);
    return runProjectOperation({
      scope: `project:${projectId}`,
      key: `project:${projectId}:delete`,
      kind: "delete",
      targetId: projectId,
      label: "Удаляем проект",
      activeStatus: "deleting"
    }, async () => {
      let result;
      try {
        result = await deleteRemoteProject(projectId, getRemoteUpdatedAt?.() || "");
      } catch (error) {
        if (error?.conflict) await handleRemoteConflict?.(error);
        throw error;
      }
      if (result.disabled) return deleteProject(projectId);
      applyProjectDeletion(projectId, {}, { skipRemoteSave: true });
      recordRemoteSave?.(getState(), result.updatedAt, result.refreshUpdatedAt, result.catalogUpdatedAt);
      return result;
    });
  }

  function applyLocalProjectUpdate(payload, project) {
    updateProjectSettings(payload);
    return project;
  }

  function applyLocalProjectPatch(projectId, patch, project) {
    setState({
      projects: getState().projects.map((item) => item.id === projectId ? { ...item, ...patch } : item)
    });
    return project;
  }

  async function retryProjectUpdateAfterConflict({ error, payload, projectId, options = {} }) {
    const remoteState = error?.state;
    const remoteProject = remoteState?.projects?.find((item) => item.id === projectId);
    if (!remoteProject || !error?.updatedAt) return null;
    const currentProject = getProject(getState(), projectId);
    const project = updateProjectEntity(remoteProject, payload);
    let result;
    try {
      result = await updateRemoteProject(project.id, project, error.updatedAt, {
        projectLimitBase: getProjectLimitBase(currentProject, options)
      });
    } catch (retryError) {
      if (retryError?.conflict) await handleRemoteConflict?.(retryError);
      throw retryError;
    }
    if (result.disabled) return applyLocalProjectUpdate(payload, project);
    const currentState = getState();
    setState({
      projects: currentState.projects.map((item) => item.id === project.id ? (result.project || project) : item)
    }, { skipRemoteSave: true });
    recordRemoteSave?.(getState(), result.updatedAt, result.refreshUpdatedAt, result.catalogUpdatedAt);
    return result.project || project;
  }

  async function retryProjectPatchAfterConflict({ error, patch, projectId, resourceName }) {
    const remoteState = error?.state;
    const remoteProject = remoteState?.projects?.find((item) => item.id === projectId);
    if (!remoteProject || !error?.updatedAt) return null;
    const project = { ...remoteProject, ...patch };
    let result;
    try {
      result = resourceName
        ? await updateRemoteProjectResource(project.id, resourceName, patch, error.updatedAt)
        : await updateRemoteProject(project.id, patch, error.updatedAt, {
            projectLimitBase: remoteProject?.projectLimit
          });
    } catch (retryError) {
      if (retryError?.conflict) await handleRemoteConflict?.(retryError);
      throw retryError;
    }
    if (result.disabled) return applyLocalProjectPatch(projectId, patch, project);
    const currentState = getState();
    setState({
      projects: currentState.projects.map((item) => item.id === project.id ? (result.project || project) : item)
    }, { skipRemoteSave: true });
    recordRemoteSave?.(getState(), result.updatedAt, result.refreshUpdatedAt, result.catalogUpdatedAt);
    return result.project || project;
  }

  function applyCreatedProject({ state, project, product }, options = {}) {
    setState({
      projects: [project, ...state.projects.filter((item) => item.id !== project.id)],
      products: [product, ...state.products.filter((item) => item.id !== product.id)],
      selectedProjectId: project.id,
      selectedProductId: product.id,
      selectedReferenceId: project.references[0]?.id || "",
      selectedCharacterId: noAvatarCharacterId,
      selectedAudioId: state.audioLibrary[0]?.id,
      selectedProjectTab: "project",
      generationBrief: ensureGenerationBrief({})
    }, options);
  }

  function rollbackCreatedProject(bundle, previousState) {
    const state = getState();
    setState({
      projects: state.projects.filter((project) => project.id !== bundle.project.id),
      products: state.products.filter((product) => product.id !== bundle.product.id),
      selectedProjectId: previousState.selectedProjectId,
      selectedProductId: previousState.selectedProductId,
      selectedReferenceId: previousState.selectedReferenceId,
      selectedCharacterId: previousState.selectedCharacterId
    }, { skipRemoteSave: true });
  }

  function applyProjectDeletion(projectId, patch = {}, options = {}) {
    const state = getState();
    const projectsNext = state.projects.filter((project) => project.id !== projectId);
    const selectedProject = projectsNext[0];
    setState({
      projects: projectsNext,
      products: state.products.filter((product) => product.projectId !== projectId),
      jobs: state.jobs.filter((job) => job.projectId !== projectId),
      ...patch,
      selectedProjectId: selectedProject.id,
      selectedProductId: getProductsForProject(state.products, selectedProject.id)[0]?.id,
      selectedCharacterId: noAvatarCharacterId,
      generationBrief: ensureGenerationBrief({})
    }, options);
  }

  function runProjectOperation(config, task) {
    if (!runScopedOperation) return task();
    return runScopedOperation({ activeStatus: "saving", ...config }, task);
  }

  function getProjectLimitBase(currentProject, options = {}) {
    const base = Number(options.projectLimitBase);
    return Number.isFinite(base) ? base : currentProject?.projectLimit;
  }

  function preserveConcurrentFields(project, payload, options = {}) {
    if (!options.savedSnapshot || !Array.isArray(options.preserveFields)) return payload;
    const next = { ...payload };
    options.preserveFields.forEach((field) => {
      if (String(payload[field] ?? "") === String(options.savedSnapshot[field] ?? "")
        && String(project[field] ?? "") !== String(options.savedSnapshot[field] ?? "")) next[field] = project[field];
    });
    return next;
  }

  return {
    updateProjectSettings,
    updateProjectSettingsRemote,
    updateProjectPatchRemote,
    updateProjectAutomation,
    updateProjectAutomationRemote,
    resetProjectDailyUsage,
    resetProjectDailyUsageRemote,
    resetProjectTotalUsage,
    resetProjectTotalUsageRemote,
    generateProjectField,
    createProject,
    createProjectRemote,
    deleteProject,
    deleteProjectRemote
  };
}

function appendUniqueIds(current = [], next = []) {
  return [...new Set([...(Array.isArray(current) ? current : []), ...next.filter(Boolean)])];
}
