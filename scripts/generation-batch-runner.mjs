import { createGenerationJob, getProductsForProject } from "../src/domain/generation.js";
import { createPendingGenerationJob } from "../src/domain/generation-placeholder.js";
import { getActiveDesignReferences } from "../src/domain/references.js";
import { isNoAvatarCharacterId, noAvatarCharacterId } from "../src/domain/avatar-selection.js";
import { createSelectionJobBatch } from "../src/state/store-context.js";
import { generateServerAiBrief } from "./generation-brief-service.mjs";
import { loadGenerationState, updateGenerationState } from "./generation-state.mjs";

const runningBatches = new Map();

export async function createGenerationBatch({ count, selection = {}, origin, deps = {} }) {
  const batchId = `batch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const result = await updateState(deps, (state) => {
    const context = createServerSelectionContext(state, selection);
    const safeCount = Math.max(1, Math.min(10, Number(count || 1)));
    const reservedJobs = createSelectionJobBatch(state, context, safeCount, { distributeProducts: true })
      .map((job, index) => createPendingGenerationJob(job, index, safeCount, {
        serverBatchId: batchId,
        selectionSnapshot: normalizeSelection(selection),
        serverOwned: true
      }));
    if (!reservedJobs.length) throw new Error("Не удалось создать задачи. Проверьте лимиты проекта.");
    return {
      ...state,
      selectedProjectTab: "queue",
      jobs: [...reservedJobs, ...(state.jobs || [])]
    };
  }, deps);
  const jobs = result.state.jobs.filter((job) => job.serverBatchId === batchId);
  if (deps.autoStart !== false) startGenerationBatchWorker({ batchId, origin, deps });
  return { batchId, jobs, state: result.state, updatedAt: result.updatedAt };
}

export async function getGenerationBatchStatus(batchId, deps = {}) {
  const state = await loadState(deps);
  const jobs = (state.jobs || []).filter((job) => job.serverBatchId === batchId);
  return { batchId, jobs, state, updatedAt: null };
}

function startGenerationBatchWorker({ batchId, origin, deps }) {
  if (runningBatches.has(batchId)) return;
  const run = runGenerationBatch({ batchId, origin, deps }).finally(() => runningBatches.delete(batchId));
  runningBatches.set(batchId, run);
}

async function runGenerationBatch({ batchId, origin, deps }) {
  while (true) {
    const next = await findNextBriefJob(batchId, deps);
    if (!next) return;
    await processBriefJob({ batchId, jobId: next.id, origin, deps });
  }
}

async function findNextBriefJob(batchId, deps) {
  const state = await loadState(deps);
  return (state.jobs || []).find((job) =>
    job.serverBatchId === batchId && job.status === "running" && job.stage === "brief" && job.isBriefPlaceholder
  );
}

async function processBriefJob({ jobId, origin, deps }) {
  try {
    const prepared = await prepareServerJob(jobId, origin, deps);
    await postServerJob(deps, origin, {
      job: prepared.job,
      context: prepared.context
    });
  } catch (error) {
    await failBriefJob(jobId, error, deps);
  }
}

async function prepareServerJob(jobId, origin, deps) {
  const state = await loadState(deps);
  const placeholder = (state.jobs || []).find((job) => job.id === jobId);
  if (!placeholder) throw new Error("Задача не найдена");
  const selection = {
    ...(placeholder.selectionSnapshot || {}),
    referenceId: placeholder.referenceId || placeholder.selectionSnapshot?.referenceId || ""
  };
  const context = createServerSelectionContext(state, selection, placeholder.productId);
  const existingJobs = (state.jobs || []).filter((job) => job.id !== jobId && job.projectId === context.project.id);
  const generateBrief = deps.generateServerAiBrief || generateServerAiBrief;
  const brief = await generateBrief({
    origin,
    ...context,
    existingJobs,
    hookLibrary: state.hookLibrary
  });
  const job = {
    ...createGenerationJob({ ...context, generationBrief: brief, existingJobs, hookLibrary: state.hookLibrary }),
    id: jobId,
    serverBatchId: placeholder.serverBatchId,
    serverOwned: true
  };
  const payload = {
    job,
    context: {
      project: context.project,
      audioLibrary: state.audioLibrary || [],
      selectedAudioId: selection.audioId || state.selectedAudioId || "",
      selectedCharacterId: selection.characterId || state.selectedCharacterId || ""
    }
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
      generationBrief: brief,
      jobs: current.jobs.map((item) => (item.id === jobId ? job : item))
    };
  }, deps);
  return payload;
}

async function failBriefJob(jobId, error, deps) {
  await updateState(deps, (state) => ({
    ...state,
    jobs: (state.jobs || []).map((job) => job.id === jobId ? {
      ...job,
      status: "failed",
      stage: "brief",
      progress: 100,
      failMsg: error.message || "AI-бриф не подготовился"
    } : job)
  }), deps);
}

function createServerSelectionContext(state, selection = {}, productId = "") {
  const project = findById(state.projects, selection.projectId || state.selectedProjectId) || state.projects?.[0];
  const products = getProductsForProject(state.products || [], project.id);
  const product = findById(products, productId || selection.productId || state.selectedProductId) || products[0];
  const references = getActiveDesignReferences(project);
  const characterId = selection.characterId || state.selectedCharacterId;
  const audioId = selection.audioId || state.selectedAudioId;
  return {
    project,
    product,
    reference: findById(references, selection.referenceId || state.selectedReferenceId) || references[0],
    character: isNoAvatarCharacterId(characterId) ? null : findById(project.characters, characterId),
    audio: findById(state.audioLibrary, audioId),
    audioLibrary: state.audioLibrary || [],
    hookLibrary: state.hookLibrary,
    generationBrief: state.generationBrief || {},
    freePrompt: selection.freePrompt ?? state.freePrompt ?? ""
  };
}

function normalizeSelection(selection = {}) {
  return {
    projectId: selection.projectId || "",
    productId: selection.productId || "",
    referenceId: selection.referenceId || "",
    characterId: selection.characterId || noAvatarCharacterId,
    audioId: selection.audioId || "",
    freePrompt: selection.freePrompt || ""
  };
}

function findById(items = [], id = "") {
  return items.find((item) => item.id === id);
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

function loadState(deps) {
  return deps.loadGenerationState ? deps.loadGenerationState() : loadGenerationState(deps);
}

function updateState(deps, updater) {
  return deps.updateGenerationState ? deps.updateGenerationState(updater) : updateGenerationState(updater, deps);
}

function postServerJob(deps, origin, body) {
  return deps.postServerJob ? deps.postServerJob(body) : postJson(origin, "/api/jobs/run", body);
}
