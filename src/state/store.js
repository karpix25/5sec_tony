import { getProductsForProject } from "../domain/generation.js";
import { isNoAvatarCharacterId, noAvatarCharacterId } from "../domain/avatar-selection.js";
import { globalAudioLibrary } from "../domain/entities.js";
import { normalizeNavigationTab } from "../domain/navigation.js";
import { getDesignReferences, getFirstDesignReference } from "../domain/references.js";
import { createRemoteAudioAssets, deleteRemoteAudioAsset, deleteRemoteAudioAssets } from "../services/audio-library-sync.js";
import { createAvatarWorkflow } from "./avatar-workflow.js";
import { createDesignReferenceWorkflow } from "./design-reference-workflow.js";
import { createDesignReferenceActions } from "./design-reference-actions.js";
import { createProjectCtaWorkflow } from "./project-cta-workflow.js";
import {
  addGlobalAudioFiles,
  deleteGlobalAudio,
  deleteGlobalAudioMany,
  ensureGlobalAudioLibrary,
  getSelectedGlobalAudioId
} from "./global-assets.js";
import { createStoreCache } from "./store-cache.js";
import { shouldScheduleRemoteSave } from "./store-persistence-policy.js";
import { mergeHydratedReferenceState, normalizePersistedReferenceState } from "./reference-libraries.js";
import { createStatePersistence } from "./state-persistence.js";
import {
  getSelectionContext
} from "./store-context.js";
import { createJobActions } from "./job-actions.js";
import { createProjectActions } from "./project-actions.js";
import { createProductActions } from "./product-actions.js";
import { createOperationController } from "./operation-controller.js";
import { rescueStaleBriefJobs } from "./brief-job-rescue.js";
import { mergeHydratedStateWithUiState } from "./ui-cache-state.js";
import { mergePendingGenerationReservations } from "./pending-generation-reservations.js";
import {
  createAudioEntity,
  ensureGenerationBrief,
  ensureProductAssets,
  ensureProjectAssets
} from "./factories.js";

export function createStore() {
  const storeCache = createStoreCache(normalize);
  let state = storeCache.createInitialStoreState();
  let persistenceStatus = { status: "local", message: "Локальный кэш" };
  let statePersistence = null;
  let hydrationSettled = false;
  let hadLocalChangesBeforeHydrate = false;
  const preHydrationLocalKeys = new Set();
  const subscribers = new Set();
  const persistenceSubscribers = new Set();

  function setState(patch, options = {}) {
    const previousState = state;
    markPreHydrationPatch(patch);
    const nextState = normalize({ ...state, ...patch });
    state = nextState;
    storeCache.persist(state);
    if (!options.skipRemoteSave && shouldScheduleRemoteSave(previousState, nextState, patch)) {
      statePersistence?.scheduleSave();
    }
    subscribers.forEach((subscriber) => subscriber(state, patch));
  }

  function replaceState(nextState) {
    const { state: stateWithPendingReservations, preservedCount } = mergePendingGenerationReservations(
      mergeHydratedReferenceState(nextState, state),
      state
    );
    const hydratedState = mergeHydratedStateWithUiState(stateWithPendingReservations, state);
    const normalizedState = normalize(hydrationSettled ? hydratedState : preservePreHydrationKeys(hydratedState, state, preHydrationLocalKeys));
    const rescuedJobs = rescueStaleBriefJobs(normalizedState.jobs || []);
    const rescued = rescuedJobs !== normalizedState.jobs;
    state = rescued ? { ...normalizedState, jobs: rescuedJobs } : normalizedState;
    storeCache.persist(state);
    if (rescued || preservedCount) statePersistence?.scheduleSave();
    subscribers.forEach((subscriber) => subscriber(state, null));
  }

  function setPersistenceStatus(status) {
    persistenceStatus = { ...persistenceStatus, ...status };
    persistenceSubscribers.forEach((subscriber) => subscriber(persistenceStatus));
  }

  const operationController = createOperationController((operations) => {
    subscribers.forEach((subscriber) => subscriber(state, { operations }));
  });

  let avatarWorkflow = null;
  const designReferenceWorkflow = createDesignReferenceWorkflow({
    getState: () => state,
    setState,
    getProject
  });
  let projectCtaWorkflow = null;
  const jobActions = createJobActions({
    getState: () => state,
    setState,
    getProject
  });
  const productActions = createProductActions({
    getState: () => state,
    setState,
    recordRemoteSave: (nextState, updatedAt, refreshUpdatedAt, catalogUpdatedAt) => statePersistence?.recordRemoteSave(nextState, updatedAt, refreshUpdatedAt, catalogUpdatedAt),
    getRemoteUpdatedAt: () => statePersistence?.getRemoteCatalogUpdatedAt?.() || "",
    handleRemoteConflict: (error) => statePersistence?.handleRemoteConflict?.(error),
    runScopedOperation: operationController.runScopedOperation
  });
  const projectActions = createProjectActions({
    getState: () => state,
    setState,
    getProject,
    recordRemoteSave: (nextState, updatedAt, refreshUpdatedAt, catalogUpdatedAt) => statePersistence?.recordRemoteSave(nextState, updatedAt, refreshUpdatedAt, catalogUpdatedAt),
    getRemoteUpdatedAt: () => statePersistence?.getRemoteCatalogUpdatedAt?.() || "",
    handleRemoteConflict: (error) => statePersistence?.handleRemoteConflict?.(error),
    runScopedOperation: operationController.runScopedOperation
  });
  avatarWorkflow = createAvatarWorkflow({
    getState: () => state,
    setState,
    getProject,
    saveProjectPatchRemote: projectActions.updateProjectPatchRemote,
    isRemoteReady: isScopedProjectRemoteReady
  });
  projectCtaWorkflow = createProjectCtaWorkflow({
    getState: () => state,
    getProject,
    setState,
    saveProjectPatchRemote: projectActions.updateProjectPatchRemote,
    isRemoteReady: isScopedProjectRemoteReady
  });
  const designReferenceActions = createDesignReferenceActions({
    getState: () => state,
    setState,
    getProject,
    recordRemoteSave: (nextState, updatedAt) => statePersistence?.recordRemoteSave(nextState, updatedAt),
    getRemoteUpdatedAt: () => statePersistence?.getRemoteUpdatedAt?.() || "",
    handleRemoteConflict: (error) => statePersistence?.handleRemoteConflict?.(error),
    isRemoteReady: () => hydrationSettled && persistenceStatus.status !== "local",
    scheduleFallbackSave: () => statePersistence?.scheduleSave?.(),
    runScopedOperation: operationController.runScopedOperation
  });
  statePersistence = createStatePersistence({
    getState: () => state,
    replaceState,
    notifyStatus: setPersistenceStatus,
    getLocalFallbackState: () => storeCache.getFallbackProjectState(),
    ...storeCache.getPendingRemoteSaveHooks(),
    hasActiveOperation: operationController.hasActiveOperation,
    onRemoteModeChange(mode) {
      if (mode === "remote") storeCache.markRemoteHealthy();
      else storeCache.markRemoteUnavailable(state);
    }
  });
  const hydrationPromise = new Promise((resolve) => setTimeout(() => resolve(statePersistence.hydrate()), 0));
  hydrationPromise.then(() => {
    hydrationSettled = true;
    if (hadLocalChangesBeforeHydrate) statePersistence.scheduleSave();
    avatarWorkflow.resumeAvatarPolling();
    designReferenceWorkflow.resumeDesignReferencePolling();
    projectCtaWorkflow.resumeProjectCtaPolling();
  });

  function markPreHydrationPatch(patch) {
    if (hydrationSettled || !patch || !Object.keys(patch).length) return;
    hadLocalChangesBeforeHydrate = true;
    Object.keys(patch).forEach((key) => preHydrationLocalKeys.add(key));
  }

  function recordAudioRemoteSave(updatedAt) {
    if (updatedAt && typeof statePersistence?.recordRemoteSave === "function") {
      statePersistence.recordRemoteSave(state, updatedAt, updatedAt);
    }
  }

  function isScopedProjectRemoteReady() {
    return hydrationSettled
      && persistenceStatus.status !== "local"
      && Boolean(statePersistence?.getRemoteUpdatedAt?.());
  }

  return {
    getState: () => state,
    getOperations: operationController.getOperations,
    runScopedOperation: operationController.runScopedOperation,
    getPersistenceStatus: () => persistenceStatus,
    whenHydrated: () => hydrationPromise,
    whenJobsHydrated: () => statePersistence?.whenJobsHydrated?.() || Promise.resolve(),
    retryHydration: () => statePersistence?.retryHydration?.(),
    subscribe(callback) {
      subscribers.add(callback);
      return () => subscribers.delete(callback);
    },
    subscribePersistence(callback) {
      persistenceSubscribers.add(callback);
      return () => persistenceSubscribers.delete(callback);
    },
    selectProject(projectId) {
      const projectProducts = getProductsForProject(state.products, projectId);
      const project = getProject(state, projectId);
      setState({
        selectedProjectId: projectId,
        selectedProductId: projectProducts[0]?.id,
        selectedReferenceId: project.references[0]?.id,
        selectedCharacterId: noAvatarCharacterId,
        selectedProjectTab: normalizeNavigationTab(state.selectedProjectTab),
        generationBrief: ensureGenerationBrief({})
      });
    },
    selectProduct(productId) {
      const product = state.products.find((item) => item.id === productId);
      if (!product) {
        setState({ selectedProductId: productId });
        return;
      }
      const project = getProject(state, product.projectId);
      const selectedReferenceId = product.projectId === state.selectedProjectId
        ? getExistingProjectReferenceId(project, state.selectedReferenceId)
        : getExistingProjectReferenceId(project, "");
      setState({
        selectedProjectId: product.projectId,
        selectedProductId: product.id,
        selectedReferenceId,
        selectedCharacterId: noAvatarCharacterId
      });
    },
    selectReference(referenceId) {
      setState({ selectedReferenceId: referenceId });
    },
    selectCharacter(characterId) {
      setState({ selectedCharacterId: characterId });
    },
    selectAudio(audioId) {
      setState({ selectedAudioId: audioId });
    },
    selectProjectTab(tab) {
      setState({ selectedProjectTab: normalizeNavigationTab(tab, state.selectedProjectTab) });
    },
    applyNavigationSelection(selection = {}) {
      const projectId = state.projects.some((project) => project.id === selection.projectId)
        ? selection.projectId
        : state.selectedProjectId;
      const project = getProject(state, projectId);
      const projectProducts = getProductsForProject(state.products, project.id);
      const productId = projectProducts.some((product) => product.id === selection.productId)
        ? selection.productId
        : projectProducts.some((product) => product.id === state.selectedProductId)
          ? state.selectedProductId
          : projectProducts[0]?.id;
      const referenceId = project.references.some((reference) => reference.id === state.selectedReferenceId)
        ? state.selectedReferenceId
        : project.references[0]?.id;
      setState({
        selectedProjectId: project.id,
        selectedProductId: productId,
        selectedReferenceId: referenceId,
        selectedCharacterId: project.characters.some((char) => char.id === state.selectedCharacterId) ? state.selectedCharacterId : noAvatarCharacterId,
        selectedProjectTab: normalizeNavigationTab(selection.tab, state.selectedProjectTab)
      });
    },
    selectQueueProductFilter(filter) {
      setState({ queueProductFilter: filter === "all" ? "all" : "current" });
    },
    setFreePrompt(freePrompt) {
      setState({ freePrompt });
    },
    updateGenerationBrief(payload) {
      setState({ generationBrief: ensureGenerationBrief(payload) });
    },
    updateHookLibrary(hookLibrary) {
      setState({ hookLibrary });
    },
    updateReelsResearch(reelsResearch) {
      setState({ reelsResearch });
    },
    ...projectActions,
    updateProjectCtaOverlay: projectCtaWorkflow.updateProjectCtaOverlayRemote || projectCtaWorkflow.updateProjectCtaOverlay,
    createProjectCtaCandidate: projectCtaWorkflow.createProjectCtaCandidateRemote || projectCtaWorkflow.createProjectCtaCandidate,
    approveProjectCtaCandidate: projectCtaWorkflow.approveProjectCtaCandidateRemote || projectCtaWorkflow.approveProjectCtaCandidate,
    resetProjectCtaOverlay: projectCtaWorkflow.resetProjectCtaOverlayRemote || projectCtaWorkflow.resetProjectCtaOverlay,
    ...productActions,
    createDesignReferenceTemplate: designReferenceWorkflow.createDesignReferenceTemplate,
    ...designReferenceActions,
    createCharacter: avatarWorkflow.createCharacter,
    uploadCharacter: avatarWorkflow.uploadCharacter,
    approveAvatar: avatarWorkflow.approveAvatar,
    rejectAvatar: avatarWorkflow.rejectAvatar,
    setCharacterActive: avatarWorkflow.setCharacterActive,
    createAvatarVideo: avatarWorkflow.createAvatarVideo,
    updateAvatarVideoOverlay: avatarWorkflow.updateAvatarVideoOverlay,
    updateAvatarVideoName: avatarWorkflow.updateAvatarVideoName,
    setAvatarVideoActive: avatarWorkflow.setAvatarVideoActive,
    createAudio(payload) {
      const audio = createAudioEntity(payload);
      setState({ audioLibrary: [audio, ...state.audioLibrary], selectedAudioId: audio.id });
    },
    createAudioFiles(payloads) {
      if (!payloads.length) return;
      const audioLibrary = addGlobalAudioFiles(state.audioLibrary, payloads);
      setState({ audioLibrary, selectedAudioId: audioLibrary[0]?.id });
    },
    async createAudioFilesRemote(payloads) {
      if (!payloads.length) return;
      const previousAudioLibrary = state.audioLibrary;
      const previousSelectedAudioId = state.selectedAudioId;
      const audioLibrary = addGlobalAudioFiles(state.audioLibrary, payloads);
      setState({ audioLibrary, selectedAudioId: audioLibrary[0]?.id }, { skipRemoteSave: true });
      let result;
      try {
        result = await createRemoteAudioAssets(payloads, statePersistence?.getRemoteUpdatedAt?.() || "");
      } catch (error) {
        setState({ audioLibrary: previousAudioLibrary, selectedAudioId: previousSelectedAudioId }, { skipRemoteSave: true });
        if (error?.conflict) await statePersistence?.handleRemoteConflict?.(error);
        throw error;
      }
      if (result.disabled) {
        setState({ audioLibrary, selectedAudioId: audioLibrary[0]?.id });
        return result;
      }
      const savedLibrary = addGlobalAudioFiles(
        state.audioLibrary.filter((audio) => !payloads.some((item) => isSameAudioDraft(audio, item))),
        result.assets.length ? result.assets : payloads
      );
      setState({ audioLibrary: savedLibrary, selectedAudioId: result.selectedAudioId || savedLibrary[0]?.id }, { skipRemoteSave: true });
      recordAudioRemoteSave(result.updatedAt);
      return result;
    },
    deleteAudio(audioId) {
      const audioLibrary = deleteGlobalAudio(state.audioLibrary, audioId);
      setState({ audioLibrary, selectedAudioId: getSelectedGlobalAudioId(audioLibrary, state.selectedAudioId) });
    },
    deleteAudioMany(audioIds) {
      const audioLibrary = deleteGlobalAudioMany(state.audioLibrary, audioIds);
      setState({ audioLibrary, selectedAudioId: getSelectedGlobalAudioId(audioLibrary, state.selectedAudioId) });
    },
    async deleteAudioRemote(audioId) {
      return this.deleteAudioManyRemote([audioId]);
    },
    async deleteAudioManyRemote(audioIds) {
      const ids = [...new Set((audioIds || []).filter(Boolean))];
      if (!ids.length) return;
      const previousAudioLibrary = state.audioLibrary;
      const previousSelectedAudioId = state.selectedAudioId;
      const audioLibrary = deleteGlobalAudioMany(state.audioLibrary, ids);
      const selectedAudioId = getSelectedGlobalAudioId(audioLibrary, state.selectedAudioId);
      setState({ audioLibrary, selectedAudioId }, { skipRemoteSave: true });
      let result;
      try {
        result = ids.length === 1
          ? await deleteRemoteAudioAsset(ids[0], previousSelectedAudioId, statePersistence?.getRemoteUpdatedAt?.() || "")
          : await deleteRemoteAudioAssets(ids, previousSelectedAudioId, statePersistence?.getRemoteUpdatedAt?.() || "");
      } catch (error) {
        setState({ audioLibrary: previousAudioLibrary, selectedAudioId: previousSelectedAudioId }, { skipRemoteSave: true });
        if (error?.conflict) await statePersistence?.handleRemoteConflict?.(error);
        throw error;
      }
      if (result.disabled) {
        setState({ audioLibrary, selectedAudioId });
        return result;
      }
      setState({
        audioLibrary: result.audioLibrary.length ? result.audioLibrary : audioLibrary,
        selectedAudioId: result.selectedAudioId || selectedAudioId
      }, { skipRemoteSave: true });
      recordAudioRemoteSave(result.updatedAt);
      return result;
    },
    deleteCharacter: avatarWorkflow.deleteCharacter,
    markAvatarVideoUsed: avatarWorkflow.markAvatarVideoUsed,
    updateAvatarVideoCtaOverlay: avatarWorkflow.updateAvatarVideoCtaOverlay,
    createAvatarVideoCtaCandidate: avatarWorkflow.createAvatarVideoCtaCandidate,
    approveAvatarVideoCtaCandidate: avatarWorkflow.approveAvatarVideoCtaCandidate,
    resetAvatarVideoCtaOverlay: avatarWorkflow.resetAvatarVideoCtaOverlay,
    ...jobActions
  };
}

export function getContext(state) { return getSelectionContext(state, getProject); }

function getProject(state, projectId) { return state.projects.find((project) => project.id === projectId) || state.projects[0]; }

function normalize(nextState) {
  const hydratedProjects = nextState.projects.map(ensureProjectAssets);
  const hydratedProducts = nextState.products.map(ensureProductAssets);
  const audioLibrary = ensureGlobalAudioLibrary({ ...nextState, projects: hydratedProjects }, globalAudioLibrary);
  const hydratedState = normalizePersistedReferenceState({
    ...nextState,
    projects: hydratedProjects,
    products: hydratedProducts,
    audioLibrary
  });
  const selectedProjectId = hydratedProjects.some((project) => project.id === nextState.selectedProjectId)
    ? nextState.selectedProjectId
    : hydratedProjects[0]?.id;
  const project = getProject(hydratedState, selectedProjectId);
  const projectProducts = getProductsForProject(hydratedProducts, project.id);
  const designReferences = getDesignReferences(project);
  const fallbackReference = getFirstDesignReference(project);
  const selectedProductId = projectProducts.some((product) => product.id === nextState.selectedProductId)
    ? nextState.selectedProductId
    : projectProducts[0]?.id;

  return {
    ...hydratedState,
    selectedProjectId,
    selectedProductId,
    selectedReferenceId: designReferences.some((ref) => ref.id === nextState.selectedReferenceId)
      ? nextState.selectedReferenceId
      : fallbackReference?.id,
    selectedCharacterId: isNoAvatarCharacterId(nextState.selectedCharacterId)
      ? noAvatarCharacterId
      : project.characters.some((char) => char.id === nextState.selectedCharacterId)
        ? nextState.selectedCharacterId
        : noAvatarCharacterId,
    selectedAudioId: getSelectedGlobalAudioId(audioLibrary, nextState.selectedAudioId),
    selectedProjectTab: normalizeNavigationTab(nextState.selectedProjectTab),
    queueProductFilter: nextState.queueProductFilter === "all" ? "all" : "current",
    generationBrief: ensureGenerationBrief(nextState.generationBrief)
  };
}

function getExistingProjectReferenceId(project, referenceId = "") {
  const references = getDesignReferences(project);
  return references.some((reference) => reference.id === referenceId)
    ? referenceId
    : references[0]?.id;
}

function preservePreHydrationKeys(remoteState, localState, protectedKeys) {
  if (!protectedKeys?.size) return remoteState;
  return {
    ...remoteState,
    ...Object.fromEntries(
      [...protectedKeys]
        .filter((key) => Object.hasOwn(localState, key))
        .map((key) => [key, localState[key]])
    )
  };
}

function isSameAudioDraft(audio, draft) {
  if (draft?.id && audio?.id === draft.id) return true;
  return Boolean(draft?.fileData && audio?.fileData === draft.fileData);
}
