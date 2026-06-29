import { isPostgresConfigured, withPostgresTransaction } from "./postgres-client.mjs";
import { appendJobQueueEvent } from "./job-ledger-events.mjs";
import { ensureJobQueueSchema } from "./job-queue-schema.mjs";

const appStateKey = process.env.APP_STATE_KEY || "default";
const activeQueueStatuses = new Set(["queued", "running", "retrying"]);

export async function enqueueJobLedgerRecord(job, context = {}, deps = {}) {
  if (!job?.id || !(deps.isPostgresConfigured || isPostgresConfigured)()) return null;
  const withTransaction = deps.withPostgresTransaction || withPostgresTransaction;
  return withTransaction(async (tx) => {
    await ensureJobQueueSchema(tx.query);
    const existing = await loadLedgerJob(tx.query, job.id);
    if (!existing) return null;
    if (activeQueueStatuses.has(existing.queueStatus)) {
      await appendLedgerEvent(tx.query, job.id, "enqueue_duplicate", existing.queueStatus, { queueName: existing.queueName });
      return existing;
    }
    await updateQueueFields(tx.query, job.id, {
      queueName: "generation",
      queueStatus: "queued",
      queuePriority: Number(job.queuePriority || 0),
      queueAttempts: 0,
      queueMaxAttempts: Number(job.queueMaxAttempts || 3),
      queueScheduledAt: new Date(),
      queueLockedAt: null,
      queueLockOwner: "",
      queueLastError: "",
      queueIdempotencyKey: job.queueIdempotencyKey || `${appStateKey}:${job.id}`,
      queueMetadata: { context }
    });
    await appendLedgerEvent(tx.query, job.id, "queued", "queued", { queueName: "generation" });
    return await loadLedgerJob(tx.query, job.id);
  });
}

export async function patchJobLedgerRecord(job, deps = {}) {
  if (!job?.id || !(deps.isPostgresConfigured || isPostgresConfigured)()) return false;
  const withTransaction = deps.withPostgresTransaction || withPostgresTransaction;
  return withTransaction(async (tx) => {
    await ensureJobQueueSchema(tx.query);
    const existing = await loadLedgerJob(tx.query, job.id);
    if (!existing) return false;
    const queueStatus = resolveQueueStatus(job);
    await updateQueueFields(tx.query, job.id, {
      queueStatus,
      queueAttempts: queueStatus === "running" ? Math.max(1, existing.queueAttempts) : existing.queueAttempts,
      queueLastError: job.failMsg || "",
      queueProviderTaskId: job.imageTaskId || existing.queueProviderTaskId,
      queueMetadata: { ...(existing.queueMetadata || {}), lastStage: job.stage || "", lastProgress: job.progress || 0 }
    });
    await appendLedgerEvent(tx.query, job.id, "patched", queueStatus, { stage: job.stage || "", progress: job.progress || 0 });
    return true;
  });
}

export async function loadJobLedgerRecord(jobId, deps = {}) {
  if (!jobId || !(deps.isPostgresConfigured || isPostgresConfigured)()) return null;
  const withTransaction = deps.withPostgresTransaction || withPostgresTransaction;
  return withTransaction(async (tx) => {
    await ensureJobQueueSchema(tx.query);
    return await loadLedgerJob(tx.query, jobId);
  });
}

export async function claimNextQueuedJob(workerId, deps = {}) {
  if (!workerId || !(deps.isPostgresConfigured || isPostgresConfigured)()) return null;
  const withTransaction = deps.withPostgresTransaction || withPostgresTransaction;
  return withTransaction(async (tx) => {
    await ensureJobQueueSchema(tx.query);
    const result = await tx.query(
      `select id from studio_jobs
       where app_state_key = $1
         and queue_name = 'generation'
         and queue_status in ('queued', 'retrying')
         and (queue_scheduled_at is null or queue_scheduled_at <= now())
       order by queue_priority desc, updated_at asc
       for update skip locked
       limit 1`,
      [appStateKey]
    );
    const jobId = result.rows[0]?.id;
    if (!jobId) return null;
    await updateQueueFields(tx.query, jobId, {
      queueStatus: "running",
      queueAttemptsIncrement: true,
      queueLockedAt: new Date(),
      queueLockOwner: workerId,
      queueLastError: ""
    });
    await appendLedgerEvent(tx.query, jobId, "claimed", "running", { workerId });
    return await loadLedgerJob(tx.query, jobId);
  });
}

export async function claimQueuedJobById(jobId, workerId, deps = {}) {
  if (!jobId || !workerId || !(deps.isPostgresConfigured || isPostgresConfigured)()) return null;
  const withTransaction = deps.withPostgresTransaction || withPostgresTransaction;
  return withTransaction(async (tx) => {
    await ensureJobQueueSchema(tx.query);
    const result = await tx.query(
      `select id from studio_jobs
       where app_state_key = $1
         and id = $2
         and queue_name = 'generation'
         and queue_status in ('queued', 'retrying')
         and (queue_scheduled_at is null or queue_scheduled_at <= now())
       for update skip locked
       limit 1`,
      [appStateKey, jobId]
    );
    if (!result.rows[0]?.id) return null;
    await updateQueueFields(tx.query, jobId, {
      queueStatus: "running",
      queueAttemptsIncrement: true,
      queueLockedAt: new Date(),
      queueLockOwner: workerId,
      queueLastError: ""
    });
    await appendLedgerEvent(tx.query, jobId, "claimed", "running", { workerId });
    return await loadLedgerJob(tx.query, jobId);
  });
}

export async function markJobWorkerFailure(jobId, error, deps = {}) {
  if (!jobId || !(deps.isPostgresConfigured || isPostgresConfigured)()) return null;
  const withTransaction = deps.withPostgresTransaction || withPostgresTransaction;
  return withTransaction(async (tx) => {
    await ensureJobQueueSchema(tx.query);
    const current = await loadLedgerJob(tx.query, jobId);
    if (!current) return null;
    const failMsg = error.message || String(error);
    const retryable = current.queueAttempts < current.queueMaxAttempts;
    const queueStatus = retryable ? "retrying" : "failed";
    await updateQueueFields(tx.query, jobId, {
      queueStatus,
      queueScheduledAt: retryable ? new Date(Date.now() + Number(deps.retryDelayMs || 15000)) : null,
      queueLockedAt: null,
      queueLockOwner: "",
      queueLastError: failMsg
    });
    await appendLedgerEvent(tx.query, jobId, retryable ? "retry_scheduled" : "failed", queueStatus, { error: failMsg });
    return { ...current, queueStatus, queueLastError: failMsg, retryable };
  });
}

export async function requeueExpiredJobLocks(options = {}) {
  if (!(options.isPostgresConfigured || isPostgresConfigured)()) return 0;
  const withTransaction = options.withPostgresTransaction || withPostgresTransaction;
  return withTransaction(async (tx) => {
    await ensureJobQueueSchema(tx.query);
    const lockTimeoutMs = Number(options.lockTimeoutMs || 15 * 60 * 1000);
    const result = await tx.query(
      `update studio_jobs
          set queue_status = case
                when queue_attempts < queue_max_attempts then 'retrying'
                else 'failed'
              end,
              queue_scheduled_at = case
                when queue_attempts < queue_max_attempts then now()
                else null
              end,
              queue_locked_at = null,
              queue_lock_owner = '',
              queue_last_error = case
                when queue_locked_at is null then 'Worker lock missing'
                else 'Worker lock expired'
              end,
              updated_at = now()
        where app_state_key = $1
          and queue_name = 'generation'
          and queue_status = 'running'
          and (
            queue_locked_at is null
            or queue_locked_at < now() - ($2::int * interval '1 millisecond')
          )
        returning id, queue_status, queue_last_error`,
      [appStateKey, lockTimeoutMs]
    );
    for (const row of result.rows || []) {
      await appendLedgerEvent(tx.query, row.id, "lock_reaped", row.queue_status, {
        reason: row.queue_last_error,
        lockTimeoutMs
      });
    }
    return result.rowCount || 0;
  });
}

async function loadLedgerJob(query, jobId) {
  const result = await query(
    `select id, queue_name, queue_status, queue_priority, queue_attempts,
            queue_max_attempts, queue_provider_task_id, queue_metadata
       from studio_jobs
      where app_state_key = $1 and id = $2 limit 1`,
    [appStateKey, jobId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    queueName: row.queue_name,
    queueStatus: row.queue_status,
    queuePriority: row.queue_priority,
    queueAttempts: row.queue_attempts,
    queueMaxAttempts: row.queue_max_attempts,
    queueProviderTaskId: row.queue_provider_task_id,
    queueMetadata: asObject(row.queue_metadata)
  };
}

async function updateQueueFields(query, jobId, patch) {
  const assignments = [];
  const values = [appStateKey, jobId];
  addText(assignments, values, "queue_name", patch.queueName);
  addText(assignments, values, "queue_status", patch.queueStatus);
  addNumber(assignments, values, "queue_priority", patch.queuePriority);
  addNumber(assignments, values, "queue_attempts", patch.queueAttempts);
  if (patch.queueAttemptsIncrement) assignments.push("queue_attempts = queue_attempts + 1");
  addNumber(assignments, values, "queue_max_attempts", patch.queueMaxAttempts);
  addTimestamp(assignments, values, "queue_scheduled_at", patch.queueScheduledAt);
  addTimestamp(assignments, values, "queue_locked_at", patch.queueLockedAt);
  addText(assignments, values, "queue_lock_owner", patch.queueLockOwner);
  addText(assignments, values, "queue_last_error", patch.queueLastError);
  addText(assignments, values, "queue_idempotency_key", patch.queueIdempotencyKey);
  addText(assignments, values, "queue_provider_task_id", patch.queueProviderTaskId);
  if (patch.queueMetadata) {
    values.push(JSON.stringify(patch.queueMetadata));
    assignments.push(`queue_metadata = $${values.length}::jsonb`);
  }
  if (!assignments.length) return;
  await query(
    `update studio_jobs set ${assignments.join(", ")}, updated_at = now()
      where app_state_key = $1 and id = $2`,
    values
  );
}

async function appendLedgerEvent(query, jobId, type, status, payload = {}) {
  await appendJobQueueEvent(query, { jobId, queueName: "generation", type, status, payload });
}

function resolveQueueStatus(job) {
  if (["queued", "running", "retrying", "failed", "completed"].includes(job.queueStatus)) return job.queueStatus;
  if (job.status === "failed") return "failed";
  if (job.status === "done" || job.status === "review") return "completed";
  if (job.status === "running") return "running";
  return "queued";
}

function addText(assignments, values, column, value) {
  if (value === undefined) return;
  values.push(value);
  assignments.push(`${column} = $${values.length}`);
}

function addNumber(assignments, values, column, value) {
  if (value === undefined) return;
  values.push(Number(value || 0));
  assignments.push(`${column} = $${values.length}`);
}

function addTimestamp(assignments, values, column, value) {
  if (value === undefined) return;
  if (value === null) {
    assignments.push(`${column} = null`);
    return;
  }
  values.push(value);
  assignments.push(`${column} = $${values.length}`);
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
