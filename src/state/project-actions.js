import { createDailyUsageDate } from "../domain/daily-usage.js";
import { getProductsForProject } from "../domain/generation.js";
import { noAvatarCharacterId } from "../domain/avatar-selection.js";
import { normalizeProjectAutomation } from "../domain/project-automation.js";
import { generateProjectStrategyField } from "../domain/project-strategy.js";
import { createRemoteProject, deleteRemoteProject, updateRemoteProject } from "../services/projects-sync.js";
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
  hasPendingRemoteSave,
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

  function updateProjectSettingsRemote(payload) {
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
      const project = updateProjectEntity(currentProject, payload);
      if (hasPendingRemoteSave?.()) return applyLocalProjectUpdate(payload, project);
      try {
        const result = await updateRemoteProject(project.id, project, getRemoteUpdatedAt?.() || "", {
          projectLimitBase: currentProject?.projectLimit
        });
        if (result.disabled) return applyLocalProjectUpdate(payload, project);
        setState({
          projects: state.projects.map((item) => item.id === project.id ? (result.project || project) : item)
        }, { skipRemoteSave: true });
        recordRemoteSave?.(getState(), result.updatedAt);
        return result.project || project;
      } catch (error) {
        if (error?.conflict) {
          const retried = await retryProjectUpdateAfterConflict({ error, payload, projectId });
          if (retried) return retried;
          await handleRemoteConflict?.(error);
        }
        if (!error?.conflict && isTransientFetchError(error)) return applyLocalProjectUpdate(payload, project);
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

  function resetProjectDailyUsage(projectId = getState().selectedProjectId) {
    const state = getState();
    setState({
      projects: state.projects.map((project) =>
        project.id === projectId ? { ...project, usedToday: 0, dailyUsageDate: createDailyUsageDate() } : project
      )
    });
  }

  function resetProjectTotalUsage(projectId = getState().selectedProjectId) {
    const state = getState();
    setState({
      projects: state.projects.map((project) => project.id === projectId ? { ...project, usedTotal: 0 } : project)
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
    return runProjectOperation({
      scope: "projects",
      key: `projects:create:${bundle.project.id}`,
      kind: "create",
      targetId: bundle.project.id,
      label: "Создаем проект"
    }, async () => {
      if (hasPendingRemoteSave?.()) {
        createProject(payload);
        return null;
      }
      let result;
      try {
        result = await createRemoteProject(bundle, getRemoteUpdatedAt?.() || "");
      } catch (error) {
        if (error?.conflict) await handleRemoteConflict?.(error);
        throw error;
      }
      if (result.disabled) {
        createProject(payload);
        return null;
      }
      const project = result.project || bundle.project;
      const product = result.product || bundle.product;
      applyCreatedProject({ state: getState(), project, product }, { skipRemoteSave: true });
      recordRemoteSave?.(getState(), result.updatedAt);
      return project;
    });
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
      if (hasPendingRemoteSave?.()) return deleteProject(projectId);
      let result;
      try {
        result = await deleteRemoteProject(projectId, getRemoteUpdatedAt?.() || "");
      } catch (error) {
        if (error?.conflict) await handleRemoteConflict?.(error);
        throw error;
      }
      if (result.disabled) return deleteProject(projectId);
      applyProjectDeletion(projectId, {}, { skipRemoteSave: true });
      recordRemoteSave?.(getState(), result.updatedAt);
      return result;
    });
  }

  function applyLocalProjectUpdate(payload, project) {
    updateProjectSettings(payload);
    return project;
  }

  async function retryProjectUpdateAfterConflict({ error, payload, projectId }) {
    const remoteState = error?.state;
    const remoteProject = remoteState?.projects?.find((item) => item.id === projectId);
    if (!remoteProject || !error?.updatedAt) return null;
    const currentProject = getProject(getState(), projectId);
    const project = updateProjectEntity(remoteProject, payload);
    let result;
    try {
      result = await updateRemoteProject(project.id, project, error.updatedAt, {
        projectLimitBase: currentProject?.projectLimit
      });
    } catch (retryError) {
      if (retryError?.conflict) await handleRemoteConflict?.(retryError);
      throw retryError;
    }
    if (result.disabled) return applyLocalProjectUpdate(payload, project);
    const currentState = getState();
    setState({
      projects: (remoteState.projects || currentState.projects).map((item) => item.id === project.id ? (result.project || project) : item),
      products: Array.isArray(remoteState.products) ? remoteState.products : currentState.products,
      jobs: Array.isArray(remoteState.jobs) ? remoteState.jobs : currentState.jobs
    }, { skipRemoteSave: true });
    recordRemoteSave?.(getState(), result.updatedAt);
    return result.project || project;
  }

  function applyCreatedProject({ state, project, product }, options = {}) {
    setState({
      projects: [project, ...state.projects],
      products: [product, ...state.products],
      selectedProjectId: project.id,
      selectedProductId: product.id,
      selectedReferenceId: project.references[0]?.id || "",
      selectedCharacterId: noAvatarCharacterId,
      selectedAudioId: state.audioLibrary[0]?.id,
      selectedProjectTab: "project",
      generationBrief: ensureGenerationBrief({})
    }, options);
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

  return {
    updateProjectSettings,
    updateProjectSettingsRemote,
    updateProjectAutomation,
    resetProjectDailyUsage,
    resetProjectTotalUsage,
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
