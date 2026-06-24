import { advanceJob, getProductsForProject } from "../domain/generation.js";
import { isNoAvatarCharacterId, noAvatarCharacterId } from "../domain/avatar-selection.js";
import { globalAudioLibrary } from "../domain/entities.js";
import { normalizeProjectAutomation } from "../domain/project-automation.js";
import { generateProjectStrategyField } from "../domain/project-strategy.js";
import { getDesignReferences, getFirstDesignReference } from "../domain/references.js";
import { createAvatarWorkflow } from "./avatar-workflow.js";
import { createDesignReferenceWorkflow } from "./design-reference-workflow.js";
import { createProjectCtaWorkflow } from "./project-cta-workflow.js";
import {
  addGlobalAudioFiles,
  deleteGlobalAudio,
  ensureGlobalAudioLibrary,
  getSelectedGlobalAudioId
} from "./global-assets.js";
import { createStoreCache } from "./store-cache.js";
import { patchJobWithQuotaAccounting } from "../domain/job-quota.js";
import { shouldScheduleRemoteSave } from "./store-persistence-policy.js";
import { updateProjectEntity, withCreatedJobs } from "./store-projects.js";
import { mergeHydratedReferenceState, normalizePersistedReferenceState } from "./reference-libraries.js";
import { createStatePersistence } from "./state-persistence.js";
import {
  createSelectionJobBatch,
  getProjectSelectionContext,
  getSelectionContext
} from "./store-context.js";
import { mergeHydratedStateWithUiState } from "./ui-cache-state.js";
import {
  createAudioEntity,
  createId,
  createProductEntity,
  createReferenceEntity,
  defaultProjectExportFolder,
  defaultProjectYandexDiskFolder,
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

  function setState(patch) {
    const previousState = state;
    markPreHydrationPatch(patch);
    const nextState = normalize({ ...state, ...patch });
    state = nextState;
    storeCache.persist(state);
    if (shouldScheduleRemoteSave(previousState, nextState, patch)) {
      statePersistence?.scheduleSave();
    }
    subscribers.forEach((subscriber) => subscriber(state, patch));
  }

  function replaceState(nextState) {
    const hydratedState = mergeHydratedStateWithUiState(mergeHydratedReferenceState(nextState, state), state);
    state = normalize(hydrationSettled ? hydratedState : preservePreHydrationKeys(hydratedState, state, preHydrationLocalKeys));
    storeCache.persist(state);
    subscribers.forEach((subscriber) => subscriber(state, null));
  }

  function setPersistenceStatus(status) {
    persistenceStatus = { ...persistenceStatus, ...status };
    persistenceSubscribers.forEach((subscriber) => subscriber(persistenceStatus));
  }

  const avatarWorkflow = createAvatarWorkflow({
    getState: () => state,
    setState,
    getProject
  });
  const designReferenceWorkflow = createDesignReferenceWorkflow({
    getState: () => state,
    setState,
    getProject
  });
  const projectCtaWorkflow = createProjectCtaWorkflow({
    getState: () => state,
    getProject,
    setState
  });
  statePersistence = createStatePersistence({
    getState: () => state,
    replaceState,
    notifyStatus: setPersistenceStatus,
    getLocalFallbackState: () => storeCache.getFallbackProjectState(),
    ...storeCache.getPendingRemoteSaveHooks(),
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

  return {
    getState: () => state,
    getPersistenceStatus: () => persistenceStatus,
    whenHydrated: () => hydrationPromise,
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
      setState({
        selectedProjectId: projectId,
        selectedProductId: projectProducts[0]?.id,
        selectedReferenceId: getProject(state, projectId).references[0]?.id,
        selectedCharacterId: getProject(state, projectId).characters[0]?.id,
        selectedProjectTab: "project",
        generationBrief: ensureGenerationBrief({})
      });
    },
    selectProduct(productId) {
      setState({ selectedProductId: productId });
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
      setState({ selectedProjectTab: tab });
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
    updateProjectSettings(payload) {
      setState({
        projects: state.projects.map((project) =>
          project.id === state.selectedProjectId
            ? updateProjectEntity(project, payload)
            : project
        )
      });
    },
    updateProjectAutomation(projectId, payload) {
      setState({
        projects: state.projects.map((project) =>
          project.id === projectId
            ? { ...project, automation: normalizeProjectAutomation({ ...(project.automation || {}), ...payload }) }
            : project
        )
      });
    },
    updateProjectCtaOverlay: projectCtaWorkflow.updateProjectCtaOverlay,
    createProjectCtaCandidate: projectCtaWorkflow.createProjectCtaCandidate,
    approveProjectCtaCandidate: projectCtaWorkflow.approveProjectCtaCandidate,
    resetProjectCtaOverlay: projectCtaWorkflow.resetProjectCtaOverlay,
    resetProjectDailyUsage(projectId = state.selectedProjectId) {
      setState({
        projects: state.projects.map((project) =>
          project.id === projectId ? { ...project, usedToday: 0 } : project
        )
      });
    },
    resetProjectTotalUsage(projectId = state.selectedProjectId) {
      setState({
        projects: state.projects.map((project) =>
          project.id === projectId ? { ...project, usedTotal: 0 } : project
        )
      });
    },
    generateProjectField(fieldName, formPayload) {
      const project = updateProjectEntity(getProject(state, state.selectedProjectId), formPayload);
      const projectProducts = getProductsForProject(state.products, state.selectedProjectId);
      const value = generateProjectStrategyField(project, projectProducts, fieldName);
      setState({
        projects: state.projects.map((item) =>
          item.id === state.selectedProjectId ? updateProjectEntity(item, { ...formPayload, [fieldName]: value }) : item
        )
      });
    },
    createProject(payload) {
      const project = {
        id: createId("project"),
        client: "Anton Studio",
        name: payload.name || "Новый проект",
        exportFolder: payload.exportFolder || defaultProjectExportFolder(payload.name || "Новый проект"),
        yandexDiskFolder: payload.yandexDiskFolder || defaultProjectYandexDiskFolder(payload.name || "Новый проект"),
        dailyLimit: Number(payload.dailyLimit || 20),
        usedToday: 0,
        projectLimit: Number(payload.projectLimit || 500),
        usedTotal: 0,
        automation: normalizeProjectAutomation(),
        ctaOverlay: {
          enabled: true,
          mode: "badge",
          text: "ЧИТАЙ ОПИСАНИЕ",
          x: 50,
          y: 78,
          scale: 100,
          opacity: 100,
          background: "#ffffff",
          color: "#111111",
          border: "#111111",
          radius: 10
        },
        companyInfo: payload.companyInfo || "",
        companyAudience: payload.companyAudience || "",
        projectTheme: payload.projectTheme || "",
        niche: payload.niche || "",
        keyScenarios: payload.keyScenarios || "",
        audiencePains: payload.audiencePains || "",
        audienceDesires: payload.audienceDesires || "",
        audienceObjections: payload.audienceObjections || "",
        allowedTriggers: payload.allowedTriggers || "",
        forbiddenTriggers: payload.forbiddenTriggers || "",
        hookAggression: payload.hookAggression || "Средняя",
        contentRestrictions: payload.contentRestrictions || "",
        toneOfVoice: payload.toneOfVoice || "спокойный экспертный",
        restrictions: payload.restrictions || "Не обещать лечение, диагнозы, гарантированный результат или обход правил.",
        style: payload.style || "единый проектный стиль инфографики",
        lastReferenceUpdate: new Date().toISOString().slice(0, 10),
        references: [createReferenceEntity({ title: "Базовый стиль проекта" })],
        audioLibrary: [createAudioEntity({ title: "Default audio 100 BPM", mood: "нейтрально", duration: "5 sec" })],
        characters: [
          {
            id: createId("char"),
            name: "Новый персонаж",
            status: "draft",
            prompt: "персонаж проекта, чистый фон, стабильный образ"
          }
        ]
      };
      const product = createProductEntity(project.id, payload.productName || "Первый продукт");
      setState({
        projects: [project, ...state.projects],
        products: [product, ...state.products],
        selectedProjectId: project.id,
        selectedProductId: product.id,
        selectedReferenceId: project.references[0].id,
        selectedCharacterId: project.characters[0].id,
        selectedAudioId: state.audioLibrary[0]?.id,
        selectedProjectTab: "project",
        generationBrief: ensureGenerationBrief({})
      });
    },
    deleteProject(projectId) {
      if (state.projects.length <= 1) return;
      const projectsNext = state.projects.filter((project) => project.id !== projectId);
      const selectedProject = projectsNext[0];
      setState({
        projects: projectsNext,
        products: state.products.filter((product) => product.projectId !== projectId),
        jobs: state.jobs.filter((job) => job.projectId !== projectId),
        selectedProjectId: selectedProject.id,
        selectedProductId: getProductsForProject(state.products, selectedProject.id)[0]?.id,
        generationBrief: ensureGenerationBrief({})
      });
    },
    createProduct(payload) {
      const product = createProductEntity(state.selectedProjectId, payload.name || "Новый продукт", payload);
      setState({
        products: [product, ...state.products],
        selectedProductId: product.id
      });
    },
    updateProduct(payload) {
      setState({
        products: state.products.map((product) =>
          product.id === state.selectedProductId
            ? createProductEntity(product.projectId, payload.name || product.name, { ...product, ...payload })
            : product
        )
      });
    },
    createProductReference(payload) {
      const reference = {
        id: createId("product-ref"),
        title: payload.title || "Референс продукта",
        promptComment: payload.promptComment || "",
        imageName: payload.imageName || "",
        imageData: payload.imageData || "",
        createdAt: new Date().toISOString()
      };
      setState({
        products: state.products.map((product) =>
          product.id === state.selectedProductId
            ? { ...product, references: [reference, ...(product.references || [])] }
            : product
        )
      });
    },
    deleteProductReference(referenceId) {
      setState({
        products: state.products.map((product) =>
          product.id === state.selectedProductId
            ? { ...product, references: (product.references || []).filter((reference) => reference.id !== referenceId) }
            : product
        )
      });
    },
    deleteProduct(productId) {
      const projectProducts = getProductsForProject(state.products, state.selectedProjectId);
      if (projectProducts.length <= 1) {
        console.warn("[store:delete-product]", {
          reason: "last-product",
          productId,
          selectedProjectId: state.selectedProjectId
        });
        return { ok: false, reason: "last-product" };
      }
      const productsNext = state.products.filter((product) => product.id !== productId);
      setState({
        products: productsNext,
        jobs: state.jobs.filter((job) => job.productId !== productId),
        selectedProductId: getProductsForProject(productsNext, state.selectedProjectId)[0]?.id,
        generationBrief: ensureGenerationBrief({})
      });
      return { ok: true };
    },
    createReference(payload) {
      const projectsNext = state.projects.map((project) => {
        if (project.id !== state.selectedProjectId) return project;
        const reference = createReferenceEntity(payload);
        return { ...project, references: [reference, ...project.references] };
      });
      const project = projectsNext.find((item) => item.id === state.selectedProjectId);
      setState({
        projects: projectsNext,
        selectedReferenceId: project.references[0].id
      });
    },
    createDesignReferenceTemplate: designReferenceWorkflow.createDesignReferenceTemplate,
    approveDesignReference: designReferenceWorkflow.approveDesignReference,
    rejectDesignReference: designReferenceWorkflow.rejectDesignReference,
    deleteReference(referenceId) {
      const project = getProject(state, state.selectedProjectId);
      const references = project.references.filter((reference) => reference.id !== referenceId);
      if (project.references.length <= 1 || references.length === project.references.length) return;
      setState({
        projects: state.projects.map((item) =>
          item.id === project.id
            ? { ...item, references }
            : item
        ),
        selectedReferenceId: references.some((reference) => reference.id === state.selectedReferenceId)
          ? state.selectedReferenceId
          : references[0]?.id
      });
    },
    createCharacter: avatarWorkflow.createCharacter,
    uploadCharacter: avatarWorkflow.uploadCharacter,
    approveAvatar: avatarWorkflow.approveAvatar,
    rejectAvatar: avatarWorkflow.rejectAvatar,
    setCharacterActive: avatarWorkflow.setCharacterActive,
    createAvatarVideo: avatarWorkflow.createAvatarVideo,
    updateAvatarVideoOverlay: avatarWorkflow.updateAvatarVideoOverlay,
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
    deleteAudio(audioId) {
      const audioLibrary = deleteGlobalAudio(state.audioLibrary, audioId);
      setState({ audioLibrary, selectedAudioId: getSelectedGlobalAudioId(audioLibrary, state.selectedAudioId) });
    },
    deleteCharacter: avatarWorkflow.deleteCharacter,
    markAvatarVideoUsed: avatarWorkflow.markAvatarVideoUsed,
    updateAvatarVideoCtaOverlay: avatarWorkflow.updateAvatarVideoCtaOverlay,
    createAvatarVideoCtaCandidate: avatarWorkflow.createAvatarVideoCtaCandidate,
    approveAvatarVideoCtaCandidate: avatarWorkflow.approveAvatarVideoCtaCandidate,
    resetAvatarVideoCtaOverlay: avatarWorkflow.resetAvatarVideoCtaOverlay,
    createJob() {
      const context = getSelectionContext(state, getProject);
      const jobs = createSelectionJobBatch(state, context, 1);
      setState(withCreatedJobs(state, jobs, context.project.id));
      return jobs[0] || null;
    },
    createJobs(count) {
      const context = getSelectionContext(state, getProject);
      const jobs = createSelectionJobBatch(state, context, count, { distributeProducts: true });
      setState(withCreatedJobs(state, jobs, context.project.id));
      return jobs;
    },
    createProjectJobs(projectId, count) {
      const context = getProjectSelectionContext(state, projectId, getProject);
      const jobs = createSelectionJobBatch(state, context, count, { distributeProducts: true });
      setState(withCreatedJobs(state, jobs, context.project.id));
      return jobs;
    },
    patchJob(jobId, payload) {
      setState(patchJobWithQuotaAccounting(state, jobId, payload));
    },
    replaceJob(jobId, jobNext) {
      setState({ jobs: state.jobs.map((job) => (job.id === jobId ? jobNext : job)) });
    },
    advanceJob(jobId) {
      setState({
        jobs: state.jobs.map((job) => (job.id === jobId ? advanceJob(job) : job))
      });
    },
    deleteJob(jobId) {
      setState({ jobs: state.jobs.filter((job) => job.id !== jobId) });
    }
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
        : project.characters[0]?.id,
    selectedAudioId: getSelectedGlobalAudioId(audioLibrary, nextState.selectedAudioId),
    selectedProjectTab: ["project", "product", "audio", "design", "avatars", "generation", "queue", "hooks"].includes(nextState.selectedProjectTab)
      ? nextState.selectedProjectTab
      : "project",
    generationBrief: ensureGenerationBrief(nextState.generationBrief)
  };
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
