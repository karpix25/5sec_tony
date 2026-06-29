import { randomUUID } from "node:crypto";
import { getRedisConnection, shouldUseBullMq } from "./job-queue-dispatcher.mjs";
import { appendJobQueueEvent } from "./job-ledger-events.mjs";
import { claimNextQueuedJob, claimQueuedJobById, markJobWorkerFailure, requeueExpiredJobLocks } from "./job-ledger-store.mjs";
import { queryPostgres } from "./postgres-client.mjs";
import { loadPersistedServerJob, loadPersistedServerJobContext, persistServerJobSnapshot } from "./server-job-state.mjs";
import { createResumedServerJobRecord, runServerJob } from "./server-job-runner.mjs";

const workerId = process.env.JOB_WORKER_ID || `worker-${randomUUID()}`;
const queueName = process.env.JOB_QUEUE_NAME || "generation";

export async function runPostgresWorkerOnce(deps = {}) {
  const claimed = await claimNextQueuedJob(workerId, deps);
  if (!claimed?.id) return false;
  await runPersistedJobById(claimed.id, { ...deps, skipClaim: true });
  return true;
}

export async function runPersistedJobById(jobId, deps = {}) {
  const claimJob = deps.claimQueuedJobById || claimQueuedJobById;
  const claimed = deps.skipClaim ? { id: jobId } : await claimJob(jobId, workerId, deps);
  if (!claimed?.id) throw new Error(`Job ${jobId} is not claimable`);
  const loadJob = deps.loadPersistedServerJob || loadPersistedServerJob;
  const loadContext = deps.loadPersistedServerJobContext || loadPersistedServerJobContext;
  const persistJob = deps.persistServerJobSnapshot || persistServerJobSnapshot;
  const job = await loadJob(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);
  const context = await loadContext(job);
  const record = createResumedServerJobRecord(job, persistJob, context);
  await persistJob({ ...record.job, queueStatus: "running", queueLockOwner: workerId });
  await appendWorkerEvent(jobId, "worker_started", "running", { workerId }, deps);
  try {
    await runServerJob(record);
    await persistJob({ ...record.job, queueStatus: "completed", queueLockOwner: "", queueLockedAt: null });
    await appendWorkerEvent(jobId, "worker_completed", "completed", { workerId }, deps);
    return record.job;
  } catch (error) {
    const failMsg = error.message || "Серверная генерация завершилась ошибкой";
    const failure = await (deps.markJobWorkerFailure || markJobWorkerFailure)(jobId, error, deps);
    const failedJob = {
      ...record.job,
      status: failure?.retryable ? "running" : "failed",
      progress: failure?.retryable ? record.job.progress || 0 : 100,
      queueStatus: failure?.queueStatus || "failed",
      queueLastError: failMsg,
      failMsg
    };
    await persistJob(failedJob);
    await appendWorkerEvent(jobId, failure?.retryable ? "worker_retrying" : "worker_failed", failedJob.queueStatus, { workerId, error: failMsg }, deps);
    throw error;
  }
}

export async function startBullMqWorker(deps = {}) {
  const env = deps.env || process.env;
  if (!shouldUseBullMq(env)) {
    throw new Error("BullMQ worker requires JOB_QUEUE_MODE=bullmq and Redis connection settings");
  }
  const { Worker } = await loadBullMq(deps);
  await (deps.requeueExpiredJobLocks || requeueExpiredJobLocks)(deps);
  const lockReaper = startJobLockReaper(deps, env);
  const worker = new Worker(queueName, async (job) => {
    await runPersistedJobById(job.data.jobId, deps);
  }, { connection: getRedisConnection(env), concurrency: Number(env.JOB_WORKER_CONCURRENCY || 2) });
  attachGracefulShutdown(worker, deps, lockReaper);
  return worker;
}

export function startJobLockReaper(deps = {}, env = process.env) {
  if (deps.disableLockReaper) return null;
  const intervalMs = Math.max(1000, Number(env.JOB_LOCK_REAPER_INTERVAL_MS || 60000));
  const requeueLocks = deps.requeueExpiredJobLocks || requeueExpiredJobLocks;
  const timer = setInterval(() => {
    requeueLocks(deps).catch((error) => {
      console.error(`[job-worker] lock reaper failed: ${error.message || error}`);
    });
  }, intervalMs);
  timer.unref?.();
  return timer;
}

async function loadBullMq(deps) {
  if (deps.BullMQ) return deps.BullMQ;
  try {
    return await import("bullmq");
  } catch (error) {
    throw new Error(`BullMQ is not installed or not available: ${error.message}`);
  }
}

async function appendWorkerEvent(jobId, type, status, payload, deps) {
  const appendEvent = deps.appendJobQueueEvent || appendJobQueueEvent;
  try {
    await appendEvent(deps.queryPostgres || queryPostgres, {
      jobId,
      queueName,
      type,
      status,
      actor: workerId,
      payload
    });
  } catch {
    // Worker events are audit-only; job snapshots remain the source of truth.
  }
}

function attachGracefulShutdown(worker, deps, lockReaper) {
  if (deps.disableSignalHandlers) return;
  const shutdown = async () => {
    try {
      if (lockReaper) clearInterval(lockReaper);
      await worker.close();
      process.exit(0);
    } catch (error) {
      console.error(`[job-worker] shutdown failed: ${error.message || error}`);
      process.exit(1);
    }
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}


if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  if (shouldUseBullMq()) {
    startBullMqWorker().then(() => console.log(`[job-worker] BullMQ worker started: ${queueName}`));
  } else {
    runPostgresWorkerOnce()
      .then((claimed) => console.log(JSON.stringify({ workerId, claimed })))
      .catch((error) => {
        console.error(error.message || error);
        process.exit(1);
      });
  }
}
