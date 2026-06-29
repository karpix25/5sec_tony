const queueName = process.env.JOB_QUEUE_NAME || "generation";

export async function dispatchJobToQueue(job, deps = {}) {
  if (!shouldUseBullMq(deps.env || process.env)) return { mode: "inline", enqueued: false };
  const { Queue } = await loadBullMq(deps);
  const queue = new Queue(queueName, { connection: getRedisConnection(deps.env || process.env) });
  await queue.add("run-server-job", { jobId: job.id }, {
    jobId: job.queueIdempotencyKey || job.id,
    attempts: Number(job.queueMaxAttempts || 3),
    backoff: { type: "exponential", delay: Number(job.queueBackoffMs || 15000) },
    removeOnComplete: 1000,
    removeOnFail: 5000
  });
  await queue.close();
  return { mode: "bullmq", enqueued: true };
}

export function shouldUseBullMq(env = process.env) {
  return env.JOB_QUEUE_MODE === "bullmq" && Boolean(env.REDIS_URL || env.REDIS_HOST);
}

export function getRedisConnection(env = process.env) {
  if (env.REDIS_URL) return { url: env.REDIS_URL };
  return {
    host: env.REDIS_HOST,
    port: Number(env.REDIS_PORT || 6379),
    password: env.REDIS_PASSWORD || undefined
  };
}

async function loadBullMq(deps) {
  if (deps.BullMQ) return deps.BullMQ;
  try {
    return await import("bullmq");
  } catch (error) {
    throw new Error(`BullMQ is not installed or not available: ${error.message}`);
  }
}
