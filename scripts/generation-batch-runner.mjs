import { normalizeStateDailyUsage } from "../src/domain/daily-usage.js";
import {
  createGenerationBatchId,
  normalizeGenerationBatchReservation,
  normalizeGenerationCount,
  normalizeGenerationSelection
} from "../src/domain/generation-batch-reservation.js";
import { createPendingGenerationJob } from "../src/domain/generation-placeholder.js";
import { createSelectionJobBatch, getSelectionJobBatchAvailability } from "../src/state/store-context.js";
import { enqueueBriefJob, getBriefQueueIdempotencyKey, getBriefQueueName } from "./brief-queue.mjs";
import { loadGenerationState, updateGenerationState } from "./generation-state.mjs";
import { createServerSelectionContext } from "./generation-selection-context.mjs";

export async function createGenerationBatch({ count, selection = {}, distributeProducts = false, reservation = {}, origin, source = "manual", deps = {} }) {
  const safeCount = normalizeGenerationCount(count);
  const normalizedReservation = normalizeGenerationBatchReservation(reservation, safeCount);
  const batchId = normalizedReservation.batchId || createGenerationBatchId();
  const result = await updateState(deps, (state) => {
    const dailyState = normalizeStateDailyUsage(state);
    const context = createServerSelectionContext(dailyState, selection);
    const availability = getSelectionJobBatchAvailability(dailyState, context, safeCount);
    const reservedJobs = createSelectionJobBatch(dailyState, context, safeCount, { distributeProducts, rotateReferences: true })
      .map((job, index) => createPendingGenerationJob(job, index, safeCount, {
        id: normalizedReservation.jobIds[index],
        serverBatchId: batchId,
        selectionSnapshot: normalizeGenerationSelection(selection),
        serverOwned: true,
        generationSource: normalizeGenerationSource(source),
        queueName: getBriefQueueName(deps.env || process.env),
        queueStatus: "queued",
        queueAttempts: 0,
        queueMaxAttempts: Number(deps.briefQueueAttempts || 3),
        queueScheduledAt: new Date().toISOString(),
        queueIdempotencyKey: getBriefQueueIdempotencyKey({ id: normalizedReservation.jobIds[index] || job.id }, batchId),
        queueMetadata: { source: "brief-queue", batchId }
      }));
    if (!reservedJobs.length) throw createBatchUnavailableError(availability.reason);
    return {
      ...dailyState,
      selectedProjectTab: "queue",
      jobs: [...reservedJobs, ...(state.jobs || [])]
    };
  }, deps);
  const jobs = result.state.jobs.filter((job) => job.serverBatchId === batchId);
  const queue = deps.autoStart === false ? [] : await enqueueBatchBriefJobs(jobs, { batchId, origin, deps });
  return { batchId, jobs, queue, state: result.state, updatedAt: result.updatedAt };
}

export async function getGenerationBatchStatus(batchId, deps = {}) {
  const state = await loadState(deps);
  const jobs = (state.jobs || []).filter((job) => job.serverBatchId === batchId);
  return { batchId, jobs, state, updatedAt: null };
}

async function enqueueBatchBriefJobs(jobs, { batchId, origin, deps }) {
  const enqueue = deps.enqueueBriefJob || enqueueBriefJob;
  const results = [];
  for (const job of jobs) {
    try {
      results.push(await enqueue(job, { batchId, origin }, deps));
    } catch (error) {
      await updateState(deps, (state) => ({
        ...state,
        jobs: (state.jobs || []).map((item) => item.id === job.id ? {
          ...item,
          status: "failed",
          progress: 100,
          queueStatus: "failed",
          queueLastError: error.message || "Не удалось поставить AI-бриф в очередь",
          failMsg: error.message || "Не удалось поставить AI-бриф в очередь"
        } : item)
      }));
      throw error;
    }
  }
  return results;
}

function loadState(deps) {
  return deps.loadGenerationState ? deps.loadGenerationState() : loadGenerationState(deps);
}

function updateState(deps, updater) {
  return deps.updateGenerationState ? deps.updateGenerationState(updater) : updateGenerationState(updater, deps);
}

function normalizeGenerationSource(value) {
  return value === "automation" ? "automation" : "manual";
}

function createBatchUnavailableError(reason) {
  const error = new Error(reason || "Не удалось создать задачи. Проверьте лимиты проекта.");
  error.statusCode = 409;
  error.code = /дизайн-референс/i.test(error.message)
    ? "DESIGN_REFERENCE_REQUIRED"
    : /дневной лимит/i.test(error.message)
      ? "DAILY_QUOTA_EXHAUSTED"
      : /лимит проекта/i.test(error.message)
        ? "PROJECT_QUOTA_EXHAUSTED"
        : "GENERATION_BATCH_UNAVAILABLE";
  return error;
}
