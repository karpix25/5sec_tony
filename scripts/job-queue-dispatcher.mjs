const queueName = process.env.JOB_QUEUE_NAME || "generation";

export async function dispatchJobToQueue(job, deps = {}) {
  if (!shouldUseBullMq(deps.env || process.env)) return { mode: "inline", enqueued: false };
  const { Queue } = await loadBullMq(deps);
  const queue = new Queue(queueName, { connection: getRedisConnection(deps.env || process.env) });
  await queue.add("run-server-job", { jobId: job.id }, {
    jobId: toBullMqJobId(job.queueIdempotencyKey || job.id),
    attempts: Number(job.queueMaxAttempts || 3),
    backoff: { type: "exponential", delay: Number(job.queueBackoffMs || 15000) },
    removeOnComplete: 1000,
    removeOnFail: 5000
  });
  await queue.close();
  return { mode: "bullmq", enqueued: true };
}

export function toBullMqJobId(value) {
  const raw = String(value || "").trim() || "job";
  return `job-${Buffer.from(raw).toString("base64url")}`;
}

export function shouldUseBullMq(env = process.env) {
  return env.JOB_QUEUE_MODE === "bullmq" && Boolean(env.REDIS_URL || env.REDIS_HOST);
}

export function getBullMqConfigError(env = process.env, options = {}) {
  if (env.JOB_QUEUE_MODE !== "bullmq") return "JOB_QUEUE_MODE должен быть bullmq";
  if (!env.REDIS_URL && !env.REDIS_HOST) return "REDIS_HOST или REDIS_URL не настроен";
  if (options.requireStrict && env.JOB_QUEUE_STRICT !== "true") return "JOB_QUEUE_STRICT должен быть true";
  return "";
}

export function assertBullMqConfig(env = process.env, options = {}) {
  const message = getBullMqConfigError(env, options);
  if (!message) return;
  const error = new Error(message);
  error.code = "JOB_QUEUE_NOT_CONFIGURED";
  throw error;
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
