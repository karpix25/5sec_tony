import {
  assertBullMqConfig,
  getRedisConnection,
  shouldUseBullMq,
  toBullMqJobId
} from "./job-queue-dispatcher.mjs";
import { processBriefJob } from "./brief-job-processor.mjs";

const defaultQueueName = "generation-brief-v2";

export function getBriefQueueName(env = process.env) {
  return env.BRIEF_QUEUE_NAME || defaultQueueName;
}

export function getBriefQueueIdempotencyKey(job, batchId = job?.serverBatchId) {
  return job?.queueIdempotencyKey || `brief:${batchId || "batch"}:${job?.id || "job"}`;
}

export async function enqueueBriefJob(job, metadata = {}, deps = {}) {
  const env = deps.env || process.env;
  assertBullMqConfig(env);
  const { Queue } = await loadBullMq(deps);
  const queueName = getBriefQueueName(env);
  const idempotencyKey = getBriefQueueIdempotencyKey(job, metadata.batchId);
  const bullJobId = toBullMqJobId(idempotencyKey);
  const queue = new Queue(queueName, { connection: getRedisConnection(env) });
  try {
    const existing = await queue.getJob?.(bullJobId);
    if (existing) {
      return {
        mode: "bullmq",
        enqueued: false,
        existing: true,
        jobId: bullJobId,
        state: await existing.getState?.()
      };
    }
    await queue.add("prepare-generation-brief", {
      jobId: job.id,
      batchId: metadata.batchId || job.serverBatchId || "",
      origin: metadata.origin || ""
    }, {
      jobId: bullJobId,
      attempts: Number(job.queueMaxAttempts || env.BRIEF_QUEUE_ATTEMPTS || 3),
      backoff: { type: "exponential", delay: Number(env.BRIEF_QUEUE_BACKOFF_MS || 15000) },
      removeOnComplete: 1000,
      removeOnFail: 5000
    });
    return { mode: "bullmq", enqueued: true, existing: false, jobId: bullJobId };
  } finally {
    await queue.close?.();
  }
}

export async function startBriefQueueWorker(deps = {}) {
  const env = deps.env || process.env;
  if (!shouldUseBullMq(env)) {
    throw new Error("Brief queue worker requires JOB_QUEUE_MODE=bullmq and Redis connection settings");
  }
  const { Worker } = await loadBullMq(deps);
  const processJob = deps.processBriefJob || processBriefJob;
  const worker = new Worker(getBriefQueueName(env), async (job) => processJob({
    ...job.data,
    attemptsMade: job.attemptsMade,
    maxAttempts: job.opts?.attempts,
    deps
  }), {
    connection: getRedisConnection(env),
    concurrency: Number(env.BRIEF_QUEUE_CONCURRENCY || 1)
  });
  if (!deps.disableSignalHandlers) attachShutdown(worker);
  return worker;
}

async function loadBullMq(deps) {
  if (deps.BullMQ) return deps.BullMQ;
  try {
    return await import("bullmq");
  } catch (error) {
    throw new Error(`BullMQ is not installed or not available: ${error.message}`);
  }
}

function attachShutdown(worker) {
  const shutdown = async () => {
    await worker.close();
    process.exit(0);
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  startBriefQueueWorker()
    .then(() => console.log(`[brief-queue] worker started: ${getBriefQueueName()}`))
    .catch((error) => {
      console.error(`[brief-queue] worker failed: ${error.message || error}`);
      process.exit(1);
    });
}
