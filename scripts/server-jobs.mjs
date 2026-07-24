import { dispatchJobToQueue, shouldUseBullMq } from "./job-queue-dispatcher.mjs";
import { enqueueJobLedgerRecord, patchJobLedgerRecord } from "./job-ledger-store.mjs";
import { isQueueManagedServerJob } from "./job-state-merge-policy.mjs";
import { loadPersistedServerJob, loadPersistedServerJobContext, persistServerJobSnapshot } from "./server-job-state.mjs";
import {
  createResumedServerJobRecord,
  getInternalServerOrigin,
  getServerJobPayload,
  isTerminalServerJob,
  runServerJob,
  resumeServerJob,
  serverJobLogger as logger,
  toPublicServerJob
} from "./server-job-runner.mjs";
import { summarizeJobForLog, summarizeServerJobContext } from "./operation-logger.mjs";

const serverJobs = new Map();

export async function handleServerJobsApi(request, response, url) {
  return createServerJobsApiHandler()(request, response, url);
}

export function createServerJobsApiHandler(deps = {}) {
  const apiDeps = {
    jobs: deps.serverJobs || serverJobs,
    persistJob: deps.persistServerJobSnapshot || persistServerJobSnapshot,
    loadJob: deps.loadPersistedServerJob || loadPersistedServerJob,
    loadJobContext: deps.loadPersistedServerJobContext || loadPersistedServerJobContext,
    enqueueLedger: deps.enqueueJobLedgerRecord || enqueueJobLedgerRecord,
    patchLedger: deps.patchJobLedgerRecord || patchJobLedgerRecord,
    dispatchJob: deps.dispatchJobToQueue || createLegacyBullMqDispatch(deps) || dispatchJobToQueue,
    shouldUseQueueWorker: deps.shouldUseQueueWorker || deps.isBullMqServerJobsEnabled || shouldUseBullMq,
    isQueueStrict: deps.isQueueStrict || (() => process.env.JOB_QUEUE_STRICT === "true")
  };
  return async function handleServerJobsApiWithDeps(request, response, url) {
    if (request.method === "POST" && url.pathname === "/api/jobs/run") {
      return startServerJob(request, response, apiDeps);
    }
    if (request.method === "GET" && url.pathname === "/api/jobs/status") {
      return getServerJobStatus(response, url.searchParams.get("jobId"), apiDeps);
    }
    return false;
  };
}

async function startServerJob(request, response, deps) {
  try {
    const body = await readJson(request);
    const job = body.job || {};
    if (!job.id) return sendJson(response, 400, { error: "job.id is required" });
    logger.log("run:request", {
      job: summarizeJobForLog(job),
      context: summarizeServerJobContext(body.context || {}),
      alreadyRunning: deps.jobs.has(job.id)
    });
    if (!deps.jobs.has(job.id)) {
      const record = createInitialServerJobRecord(job, body.context || {}, deps);
      deps.jobs.set(job.id, record);
      await enqueueServerJobLedger(record);
      await persistServerJobRecord(record);
      record.patchLedger = deps.patchLedger;
      const dispatch = await dispatchServerJob(record, deps);
      const payload = getServerJobPayload(record);
      logger.log("run:accepted", {
        job: summarizeJobForLog(record.job),
        origin: record.origin,
        context: summarizeServerJobContext(record.context),
        dispatchMode: dispatch.mode || "inline"
      });
      if (dispatch.mode === "bullmq") {
        deps.jobs.delete(job.id);
        return sendJson(response, 200, payload);
      }
      runServerJobInline(record);
    }
    return sendJson(response, 200, getServerJobPayload(deps.jobs.get(job.id)));
  } catch (error) {
    logger.log("run:request-error", { error: error.message || error });
    return sendJson(response, error.statusCode || 502, { error: error.message || "Не удалось запустить серверную задачу" });
  }
}

async function getServerJobStatus(response, jobId, deps) {
  const record = deps.jobs.get(jobId || "");
  if (!record) {
    logger.log("status:miss", { jobId: jobId || "" });
    return sendPersistedServerJobStatus(response, jobId, deps);
  }
  logger.log("status:hit", { job: summarizeJobForLog(record.job) });
  return sendJson(response, 200, getServerJobPayload(record));
}

function createInitialServerJobRecord(job, context, deps) {
  return {
    job: {
      ...job,
      status: "running",
      stage: "image",
      progress: 18,
      queueName: job.queueName || "generation",
      queueStatus: "queued",
      queuePriority: Number(job.queuePriority || 0),
      queueAttempts: Number(job.queueAttempts || 0),
      queueMaxAttempts: Number(job.queueMaxAttempts || 3),
      queueScheduledAt: new Date().toISOString(),
      queueLockOwner: "",
      queueLastError: "",
      queueIdempotencyKey: job.queueIdempotencyKey || `generation:${job.id}`,
      queueMetadata: job.queueMetadata || {},
      serverJobAcceptedAt: new Date().toISOString(),
      serverJobContext: context,
      failMsg: "Сервер запустил генерацию..."
    },
    context,
    origin: getInternalServerOrigin(),
    avatarUsage: null,
    persistJob: deps.persistJob,
    patchLedger: null,
    enqueueLedger: deps.enqueueLedger
  };
}

function runServerJobInline(record) {
  runServerJob(record).catch(async (error) => {
    logger.log("run:unhandled-error", { job: summarizeJobForLog(record.job), error: error.message || error });
    await patchFailedInlineJob(record, error.message || "Серверная генерация завершилась ошибкой");
  });
}

async function patchFailedInlineJob(record, failMsg) {
  record.job = { ...record.job, status: "failed", stage: "image", progress: 100, queueStatus: "failed", serverJobFailedAt: new Date().toISOString(), failMsg };
  await persistServerJobRecord(record);
}

async function dispatchServerJob(record, deps) {
  try {
    const dispatch = await deps.dispatchJob(record.job);
    if (dispatch.mode === "bullmq") {
      record.job = { ...record.job, failMsg: "Сервер поставил задачу в очередь воркеров..." };
      await patchServerJobLedger(record);
    }
    return dispatch;
  } catch (error) {
    logger.log("dispatch:error", { job: summarizeJobForLog(record.job), error: error.message || error });
    if (deps.isQueueStrict()) {
      const strictError = new Error("Очередь воркеров недоступна. Задача не запущена, чтобы не перегружать web-сервер.");
      strictError.statusCode = 503;
      record.job = { ...record.job, status: "failed", progress: 100, queueStatus: "failed", serverJobFailedAt: new Date().toISOString(), failMsg: strictError.message };
      await persistServerJobRecord(record);
      deps.jobs?.delete(record.job.id);
      throw strictError;
    }
    record.job = {
      ...record.job,
      queueStatus: "running",
      failMsg: "Очередь воркеров недоступна, запускаем задачу на текущем сервере..."
    };
    await persistServerJobRecord(record);
    return { mode: "inline", enqueued: false, error: error.message || String(error) };
  }
}

async function persistServerJobRecord(record) {
  try {
    await record.persistJob?.(record.job);
    await record.patchLedger?.(record.job);
    logger.log("persist:done", { job: summarizeJobForLog(record.job) });
  } catch (error) {
    logger.log("persist:error", { job: summarizeJobForLog(record.job), error: error.message || error });
    console.warn(`[server-job:persist:error] ${error.message || error}`);
  }
}

async function patchServerJobLedger(record) {
  try {
    await record.patchLedger?.(record.job);
  } catch (error) {
    logger.log("ledger:patch-error", { job: summarizeJobForLog(record.job), error: error.message || error });
  }
}

async function sendPersistedServerJobStatus(response, jobId, deps) {
  const job = await deps.loadJob(jobId || "");
  if (!job) {
    logger.log("status:persisted-miss", { jobId: jobId || "" });
    return sendJson(response, 404, { error: "server job not found" });
  }
  logger.log("status:persisted-hit", { job: summarizeJobForLog(job) });
  if (isTerminalServerJob(job) || (deps.shouldUseQueueWorker() && isQueueManagedServerJob(job))) {
    return sendJson(response, 200, { job: toPublicServerJob(job), avatarUsage: null });
  }
  const record = createResumedServerJobRecord(job, deps.persistJob, await deps.loadJobContext(job), deps.patchLedger);
  deps.jobs.set(job.id, record);
  record.job = { ...record.job, status: "running", failMsg: "Сервер восстановил задачу после перезапуска..." };
  await persistServerJobRecord(record);
  resumeServerJob(record).catch(async (error) => {
    logger.log("resume:failed", { job: summarizeJobForLog(record.job), error: error.message || error });
    record.job = {
      ...record.job,
      status: "failed",
      progress: 100,
      failMsg: error.message || "Не удалось восстановить серверную задачу после перезапуска."
    };
    persistServerJobRecord(record);
  });
  return sendJson(response, 200, getServerJobPayload(record));
}

function createLegacyBullMqDispatch(deps) {
  if (!deps.enqueueBullMqServerJob) return null;
  return async (job) => {
    if (deps.isBullMqServerJobsEnabled && !deps.isBullMqServerJobsEnabled()) return { mode: "inline", enqueued: false };
    await deps.enqueueBullMqServerJob(job.id);
    return { mode: "bullmq", enqueued: true };
  };
}

async function enqueueServerJobLedger(record) {
  try {
    await record.enqueueLedger?.(record.job, record.context);
  } catch (error) {
    logger.log("ledger:enqueue-error", { job: summarizeJobForLog(record.job), error: error.message || error });
  }
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let data = "";
    request.on("data", (chunk) => { data += chunk; });
    request.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch (error) { reject(error); }
    });
  });
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
  return true;
}
