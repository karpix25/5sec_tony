import { appendJobQueueEvent } from "./job-ledger-events.mjs";
import { dispatchJobToQueue, shouldUseBullMq } from "./job-queue-dispatcher.mjs";
import { lockAppStateMutation } from "./app-state-advisory-lock.mjs";
import { isPostgresConfigured, withPostgresTransaction } from "./postgres-client.mjs";
import { ensureJobQueueSchema } from "./job-queue-schema.mjs";

const appStateKey = process.env.APP_STATE_KEY || "default";
const defaultMaxManualRetries = 3;

export function createRetryFailedJobsApiHandler(deps = {}) {
  const apiDeps = {
    isConfigured: deps.isPostgresConfigured || isPostgresConfigured,
    withTransaction: deps.withPostgresTransaction || withPostgresTransaction,
    dispatch: deps.dispatchJobToQueue || dispatchJobToQueue,
    canUseQueue: deps.shouldUseBullMq || shouldUseBullMq,
    maxManualRetries: Math.max(1, Number(deps.maxManualRetries || defaultMaxManualRetries))
  };
  return async function handleRetryFailedJobsApi(request, response, url) {
    if (request.method !== "POST" || url.pathname !== "/api/jobs/retry-failed") return false;
    try {
      if (!apiDeps.isConfigured()) return sendJson(response, 503, { error: "Postgres не настроен" });
      if (!apiDeps.canUseQueue()) return sendJson(response, 503, { error: "Очередь воркеров недоступна" });
      const body = await readJson(request);
      const scope = normalizeRetryScope(body);
      if (!scope.projectId) return sendJson(response, 400, { error: "projectId is required" });
      const result = await retryFailedJobs(scope, apiDeps);
      return sendJson(response, 200, result);
    } catch (error) {
      return sendJson(response, error.statusCode || 502, { error: error.message || "Не удалось повторить генерацию" });
    }
  };
}

export const handleRetryFailedJobsApi = createRetryFailedJobsApiHandler();

export async function retryFailedJobs(scope, deps) {
  const queued = await deps.withTransaction(async (tx) => {
    await ensureJobQueueSchema(tx.query);
    await lockAppStateMutation(tx.query, appStateKey, scope.projectId);
    const result = await tx.query(
      `select * from studio_jobs
       where app_state_key = $1
         and project_id = $2
         and queue_name = 'generation'
         and (status = 'failed' or queue_status = 'failed')
         and coalesce(extra->>'serverReservationStatus', '') <> 'failed'
       and ($3 = '' or extra->>'serverBatchId' = $3)
         and (cardinality($5::text[]) = 0 or id = any($5::text[]))
         and coalesce((extra->>'manualRetryCount')::int, 0) < $4
       order by updated_at asc
       for update`,
      [appStateKey, scope.projectId, scope.batchId, deps.maxManualRetries, scope.jobIds]
    );
    const now = new Date().toISOString();
    const jobs = [];
    for (const row of result.rows || []) {
      const previousError = row.queue_last_error || asObject(row.extra).failMsg || "Неизвестная ошибка генерации";
      const extra = asObject(row.extra);
      const retryHistory = [...asArray(extra.retryHistory), {
        at: now,
        message: previousError,
        queueAttempts: Number(row.queue_attempts || 0),
        queueStatus: row.queue_status || row.status || "failed"
      }].slice(-10);
      const nextExtra = {
        ...extra,
        retryHistory,
        manualRetryCount: Number(extra.manualRetryCount || 0) + 1,
        lastRetryAt: now,
        failMsg: "Повторная попытка поставлена в очередь после восстановления баланса."
      };
      await tx.query(
        `update studio_jobs
            set status = 'queued',
                progress = 0,
                queue_status = 'queued',
                queue_attempts = 0,
                queue_scheduled_at = now(),
                queue_locked_at = null,
                queue_lock_owner = '',
                queue_last_error = '',
                extra = $3::jsonb,
                updated_at = now()
          where app_state_key = $1 and id = $2`,
        [appStateKey, row.id, JSON.stringify(nextExtra)]
      );
      await appendJobQueueEvent(tx.query, {
        jobId: row.id,
        queueName: "generation",
        type: "manual_retry_queued",
        status: "queued",
        message: "Повторная генерация запрошена оператором",
        payload: { projectId: scope.projectId, batchId: scope.batchId, retryCount: nextExtra.manualRetryCount }
      });
      jobs.push({
        ...rowToJob(row),
        status: "queued",
        progress: 0,
        queueStatus: "queued",
        queueAttempts: 0,
        queueScheduledAt: now,
        queueLockedAt: null,
        queueLockOwner: "",
        queueLastError: "",
        ...nextExtra
      });
    }
    return jobs;
  });

  const dispatched = [];
  for (const job of queued) {
    const dispatch = await deps.dispatch(job);
    dispatched.push({ id: job.id, enqueued: dispatch?.enqueued !== false, existing: Boolean(dispatch?.existing) });
  }
  return {
    projectId: scope.projectId,
    batchId: scope.batchId,
    matched: queued.length,
    queued: dispatched.filter((item) => item.enqueued).length,
    dispatched,
    maxManualRetries: deps.maxManualRetries,
    jobs: queued
  };
}

function normalizeRetryScope(body = {}) {
  return {
    projectId: String(body.projectId || "").trim(),
    batchId: String(body.batchId || "").trim(),
    jobIds: [...new Set((Array.isArray(body.jobIds) ? body.jobIds : []).map((id) => String(id || "").trim()).filter(Boolean))].slice(0, 100)
  };
}

function rowToJob(row) {
  return {
    ...asObject(row.extra),
    id: row.id,
    projectId: row.project_id,
    productId: row.product_id,
    characterId: row.character_id,
    status: row.status,
    stage: row.stage,
    progress: row.progress,
    title: row.title,
    topic: row.topic,
    music: row.music,
    prompt: row.prompt,
    outputType: row.output_type,
    queueName: row.queue_name,
    queueStatus: row.queue_status,
    queuePriority: row.queue_priority,
    queueAttempts: row.queue_attempts,
    queueMaxAttempts: row.queue_max_attempts,
    queueIdempotencyKey: row.queue_idempotency_key,
    queueMetadata: asObject(row.queue_metadata)
  };
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function readJson(request) {
  return readJsonRequest(request);
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
  return true;
}
import { readJsonRequest } from "./request-body.mjs";
