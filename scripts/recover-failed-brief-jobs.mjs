import { appendJobQueueEvent } from "./job-ledger-events.mjs";
import { enqueueBriefJob, getBriefQueueName } from "./brief-queue.mjs";
import { lockAppStateMutation } from "./app-state-advisory-lock.mjs";
import { withPostgresTransaction } from "./postgres-client.mjs";
import { ensureJobQueueSchema } from "./job-queue-schema.mjs";

const defaultLimit = 50;

export async function recoverFailedBriefJobs(options = {}, deps = {}) {
  const env = deps.env || process.env;
  const appStateKey = options.appStateKey || env.APP_STATE_KEY || "default";
  const projectId = String(options.projectId || "").trim();
  const limit = normalizeLimit(options.limit ?? env.RECOVER_FAILED_BRIEF_LIMIT);
  const origin = options.origin || env.INTERNAL_SERVER_ORIGIN || env.AUTOMATION_ORIGIN || "http://127.0.0.1:4173";
  const queueName = getBriefQueueName(env);
  const withTransaction = deps.withPostgresTransaction || withPostgresTransaction;
  const ensureSchema = deps.ensureJobQueueSchema || ensureJobQueueSchema;
  const enqueue = deps.enqueueBriefJob || enqueueBriefJob;

  const claimed = await withTransaction(async (tx) => {
    await ensureSchema(tx.query);
    await lockAppStateMutation(tx.query, appStateKey, projectId);
    const result = await tx.query(
      `select * from studio_jobs
       where app_state_key = $1
         and ($2 = '' or project_id = $2)
         and stage = 'brief'
         and (status = 'failed' or queue_status = 'failed')
         and coalesce(queue_status, '') not in ('queued', 'running', 'retrying')
         and coalesce(extra->>'serverReservationStatus', '') <> 'failed'
       order by updated_at asc
       limit $3
       for update skip locked`,
      [appStateKey, projectId, limit]
    );
    const now = new Date().toISOString();
    const jobs = [];
    for (const row of result.rows || []) {
      const job = rowToRecoveryJob(row, { queueName, now });
      await tx.query(
        `update studio_jobs
            set status = 'queued',
                progress = 3,
                queue_name = $3,
                queue_status = 'queued',
                queue_attempts = 0,
                queue_scheduled_at = now(),
                queue_locked_at = null,
                queue_lock_owner = '',
                queue_last_error = '',
                queue_idempotency_key = $4,
                queue_metadata = $5::jsonb,
                extra = $6::jsonb,
                updated_at = now()
          where app_state_key = $1 and id = $2`,
        [appStateKey, row.id, queueName, job.queueIdempotencyKey, JSON.stringify(job.queueMetadata), JSON.stringify(job.extra)]
      );
      await appendJobQueueEvent(tx.query, {
        appStateKey,
        jobId: row.id,
        queueName,
        type: "failed_brief_recovery_queued",
        status: "queued",
        message: "Старая ошибка AI-брифа поставлена на повторную подготовку",
        payload: { projectId: row.project_id, source: "failed-brief-recovery" }
      });
      jobs.push(job);
    }
    return jobs;
  });

  const recovered = [];
  for (const job of claimed) {
    try {
      const result = await enqueue(job, { batchId: job.serverBatchId, origin }, { ...deps, env });
      recovered.push({ id: job.id, queueIdempotencyKey: job.queueIdempotencyKey, enqueued: result?.enqueued !== false, existing: Boolean(result?.existing) });
    } catch (error) {
      await markRecoveryFailure(job, error, { appStateKey, withTransaction });
      recovered.push({ id: job.id, queueIdempotencyKey: job.queueIdempotencyKey, enqueued: false, error: error.message || String(error) });
    }
  }

  return {
    appStateKey,
    projectId,
    queueName,
    limit,
    matched: claimed.length,
    queued: recovered.filter((item) => item.enqueued).length,
    recovered
  };
}

async function markRecoveryFailure(job, error, options) {
  await options.withTransaction(async (tx) => {
    await tx.query(
      `update studio_jobs
          set status = 'failed', queue_status = 'failed', queue_last_error = $3, updated_at = now()
        where app_state_key = $1 and id = $2`,
      [options.appStateKey, job.id, error.message || String(error)]
    );
  });
}

function rowToRecoveryJob(row, { queueName, now }) {
  const extra = asObject(row.extra);
  const nextExtra = {
    ...extra,
    isBriefPlaceholder: true,
    briefRecoveryAt: now
  };
  const queueMetadata = {
    ...asObject(row.queue_metadata),
    source: "failed-brief-recovery",
    recoveredAt: now
  };
  return {
    ...nextExtra,
    id: row.id,
    projectId: row.project_id,
    productId: row.product_id,
    characterId: row.character_id,
    status: "queued",
    stage: "brief",
    progress: 3,
    queueName,
    queueStatus: "queued",
    queueAttempts: 0,
    queueMaxAttempts: Number(row.queue_max_attempts || 3),
    queueIdempotencyKey: `brief:recovery:${row.id}`,
    queueMetadata,
    serverBatchId: extra.serverBatchId || "",
    isBriefPlaceholder: true,
    extra: nextExtra
  };
}

function normalizeLimit(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 1000) : defaultLimit;
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  recoverFailedBriefJobs({ limit: process.argv[2] })
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error) => {
      console.error(`[recover-failed-brief-jobs] failed: ${error.message || error}`);
      process.exitCode = 1;
    });
}
