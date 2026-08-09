import { createGenerationJob } from "../src/domain/generation.js";
import { generateServerAiBrief } from "./generation-brief-service.mjs";
import { ensureGenerationPreflight } from "./generation-preflight.mjs";
import { createServerSelectionContext } from "./generation-selection-context.mjs";
import { loadGenerationState, updateGenerationState } from "./generation-state.mjs";

export async function processBriefJob({ jobId, batchId = "", origin, attemptsMade = 0, maxAttempts = 3, deps = {} }) {
  try {
    const state = await loadState(deps);
    const current = state.jobs?.find((job) => job.id === jobId);
    if (current && !current.isBriefPlaceholder) {
      if (!isGenerationDispatchPending(current)) return current;
      const fullState = await loadFullState(deps);
      const fullJob = fullState.jobs?.find((job) => job.id === jobId);
      if (!fullJob) throw new Error("Задача не найдена");
      if (!isGenerationDispatchPending(fullJob)) return fullJob;
      await postServerJob(deps, origin, {
        job: fullJob,
        context: createServerJobContext(fullState, fullJob, {})
      });
      await markBriefDispatched(jobId, deps);
      return fullJob;
    }
    await markBriefRunning(jobId, deps);
    const prepared = await prepareServerJob(jobId, origin, deps);
    await postServerJob(deps, origin, { job: prepared.job, context: prepared.context });
    await markBriefDispatched(jobId, deps);
    return prepared.job;
  } catch (error) {
    await markBriefFailure(jobId, error, { deps, attemptsMade, maxAttempts, batchId });
    throw error;
  }
}

function isGenerationDispatchPending(job) {
  return job.queueName === "generation"
    && ["queued", "retrying"].includes(String(job.queueStatus || "").toLowerCase())
    && !job.serverJobAcceptedAt;
}

export async function prepareServerJob(jobId, origin, deps = {}) {
  const state = await loadState(deps);
  const placeholder = (state.jobs || []).find((job) => job.id === jobId);
  if (!placeholder) throw new Error("Задача не найдена");
  if (!placeholder.isBriefPlaceholder) return { job: placeholder, context: createServerJobContext(state, placeholder, {}) };

  const selection = {
    ...(placeholder.selectionSnapshot || {}),
    referenceId: placeholder.referenceId || placeholder.selectionSnapshot?.referenceId || ""
  };
  await ensureGenerationPreflight({ selection, origin, deps });
  const preparedState = await loadState(deps);
  const preparedPlaceholder = (preparedState.jobs || []).find((job) => job.id === jobId);
  if (!preparedPlaceholder) throw new Error("Задача не найдена");
  const context = createServerSelectionContext(preparedState, selection, preparedPlaceholder.productId);
  const existingJobs = (preparedState.jobs || []).filter((job) => job.id !== jobId && job.projectId === context.project.id);
  const generateBrief = deps.generateServerAiBrief || generateServerAiBrief;
  const brief = await generateBrief({
    origin,
    ...context,
    existingJobs,
    hookLibrary: preparedState.hookLibrary
  });
  const job = {
    ...createGenerationJob({ ...context, generationBrief: brief, existingJobs, hookLibrary: preparedState.hookLibrary }),
    id: jobId,
    createdAt: preparedPlaceholder.createdAt || new Date().toISOString(),
    serverBatchId: preparedPlaceholder.serverBatchId,
    serverOwned: true,
    generationSource: preparedPlaceholder.generationSource || "manual",
    queueName: "generation",
    queueStatus: "queued",
    queueMaxAttempts: Number(preparedPlaceholder.queueMaxAttempts || 3),
    queueIdempotencyKey: `generation:${jobId}`,
    queueMetadata: { source: "brief-queue", batchId: preparedPlaceholder.serverBatchId || "" }
  };
  const payload = {
    job,
    context: createServerJobContext(preparedState, preparedPlaceholder, context)
  };
  await updateState(deps, (current) => {
    const products = brief.productPassport
      ? current.products.map((item) => item.id === context.product.id ? { ...item, aiPassport: brief.productPassport } : item)
      : current.products;
    const projects = brief.designFormatBrief
      ? current.projects.map((project) => project.id === context.project.id ? {
          ...project,
          references: (project.references || []).map((item) =>
            item.id === context.reference.id ? { ...item, designAnalysis: brief.designFormatBrief } : item
          )
        } : project)
      : current.projects;
    return {
      ...current,
      products,
      projects,
      jobs: current.jobs.map((item) => (item.id === jobId ? job : item))
    };
  }, deps);
  return payload;
}

async function markBriefRunning(jobId, deps) {
  await updateState(deps, (state) => ({
    ...state,
    jobs: (state.jobs || []).map((job) => job.id === jobId ? {
      ...job,
      status: "running",
      stage: "brief",
      progress: 3,
      queueName: job.queueName || "generation-brief",
      queueStatus: "running",
      queueAttempts: Number(job.queueAttempts || 0) + 1,
      queueLastError: "",
      failMsg: "AI-команда готовит бриф..."
    } : job)
  }), deps);
}

async function markBriefFailure(jobId, error, options) {
  const terminal = Number(options.attemptsMade || 0) + 1 >= Number(options.maxAttempts || 3);
  await updateState(options.deps, (state) => ({
    ...state,
    jobs: (state.jobs || []).map((job) => job.id === jobId ? {
      ...job,
      status: terminal ? "failed" : "running",
      stage: "brief",
      progress: terminal ? 100 : 3,
      queueName: job.queueName || "generation-brief",
      queueStatus: terminal ? "failed" : "retrying",
      queueLastError: error.message || "AI-бриф не подготовился",
      failMsg: terminal
        ? error.message || "AI-бриф не подготовился"
        : "AI-бриф не подготовился. Повторная попытка поставлена в очередь."
    } : job)
  }), options.deps);
}

async function markBriefDispatched(jobId, deps) {
  await updateState(deps, (state) => ({
    ...state,
    jobs: (state.jobs || []).map((job) => job.id === jobId && !job.serverJobAcceptedAt ? {
      ...job,
      serverJobAcceptedAt: new Date().toISOString(),
      failMsg: "Сервер поставил задачу в очередь воркеров..."
    } : job)
  }), deps);
}

function createServerJobContext(state, placeholder, context) {
  const selection = placeholder.selectionSnapshot || {};
  return {
    project: context.project || state.projects.find((project) => project.id === placeholder.projectId),
    product: context.product || state.products.find((product) => product.id === placeholder.productId),
    audioLibrary: state.audioLibrary || [],
    selectedAudioId: selection.audioId || state.selectedAudioId || "",
    selectedCharacterId: selection.characterId || state.selectedCharacterId || ""
  };
}

function loadState(deps) {
  return deps.loadGenerationState ? deps.loadGenerationState({ compactJobs: true }) : loadGenerationState(deps, { compactJobs: true });
}

function loadFullState(deps) {
  return deps.loadGenerationState ? deps.loadGenerationState() : loadGenerationState(deps);
}

function updateState(deps, updater) {
  const compactDeps = { ...deps, stateLoadOptions: { ...(deps.stateLoadOptions || {}), compactJobs: true } };
  return deps.updateGenerationState ? deps.updateGenerationState(updater, compactDeps) : updateGenerationState(updater, compactDeps);
}

function postServerJob(deps, origin, body) {
  return deps.postServerJob ? deps.postServerJob(body) : postJson(origin, "/api/jobs/run", body);
}

async function postJson(origin, path, body) {
  const response = await fetch(`${origin}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Generation job API failed: ${response.status}`);
  return payload;
}
