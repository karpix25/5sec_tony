import { patchJobWithQuotaAccounting } from "../src/domain/job-quota.js";
import { lockAppStateMutation } from "./app-state-advisory-lock.mjs";
import { isPostgresConfigured, withPostgresTransaction } from "./postgres-client.mjs";
import { loadNormalizedState, saveLegacyState } from "./state-relational-store.mjs";

const appStateKey = process.env.APP_STATE_KEY || "default";
const jobColumns = {
  projectId: "project_id",
  productId: "product_id",
  characterId: "character_id",
  status: "status",
  stage: "stage",
  progress: "progress",
  title: "title",
  topic: "topic",
  music: "music",
  prompt: "prompt",
  referenceTitle: "reference_title",
  outputType: "output_type",
  finalVideoUrl: "final_video_url",
  finalVideoHasAudio: "final_video_has_audio",
  semanticKey: "semantic_key",
  meaningPatternId: "meaning_pattern_id",
  productVisualMode: "product_visual_mode",
  compositionMode: "composition_mode",
  contentLayerId: "content_layer_id",
  format: "format",
  inputUrls: "input_urls",
  inputRefs: "input_refs",
  diversitySlot: "diversity_slot",
  queueName: "queue_name",
  queueStatus: "queue_status",
  queuePriority: "queue_priority",
  queueAttempts: "queue_attempts",
  queueMaxAttempts: "queue_max_attempts",
  queueScheduledAt: "queue_scheduled_at",
  queueLockedAt: "queue_locked_at",
  queueLockOwner: "queue_lock_owner",
  queueLastError: "queue_last_error",
  queueIdempotencyKey: "queue_idempotency_key",
  queueProviderTaskId: "queue_provider_task_id",
  queueMetadata: "queue_metadata"
};

const jsonKeys = new Set(["inputUrls", "inputRefs", "diversitySlot", "queueMetadata"]);

export async function persistServerJobSnapshot(job, deps = {}) {
  if (!job?.id || !(deps.isPostgresConfigured || isPostgresConfigured)()) return false;
  const withTransaction = deps.withPostgresTransaction || withPostgresTransaction;
  return withTransaction(async (tx) => {
    await lockAppStateMutation(tx.query, appStateKey);
    const current = await loadPersistedJob(tx.query, job.id);
    if (!current) return false;
    const merged = { ...current, ...job };
    const accounted = await applyQuotaAccounting(tx.query, current, merged);
    await updateRelationalJobRow(tx.query, accounted.job);
    if (accounted.project) {
      await updateProjectUsageRow(tx.query, accounted.project);
      await rebuildLegacyMirror(tx.query);
    }
    return true;
  });
}

export async function loadPersistedServerJob(jobId, deps = {}) {
  if (!jobId || !(deps.isPostgresConfigured || isPostgresConfigured)()) return null;
  const withTransaction = deps.withPostgresTransaction || withPostgresTransaction;
  return withTransaction((tx) => loadPersistedJob(tx.query, jobId));
}

export async function loadPersistedServerJobContext(job, deps = {}) {
  if (!job?.projectId || !(deps.isPostgresConfigured || isPostgresConfigured)()) return {};
  const withTransaction = deps.withPostgresTransaction || withPostgresTransaction;
  return withTransaction(async (tx) => ({
    project: await loadServerJobProject(tx.query, job.projectId),
    product: await loadServerJobProduct(tx.query, job.productId),
    audioLibrary: await loadServerJobAudioLibrary(tx.query),
    selectedCharacterId: job.characterId || "",
    selectedAudioId: ""
  }));
}

async function loadPersistedJob(query, jobId) {
  return await loadRelationalJobRow(query, jobId) || await loadLegacyJob(query, jobId);
}

async function loadRelationalJobRow(query, jobId) {
  if (!(await hasRelationalJobsTable(query))) return null;
  const result = await query("select * from studio_jobs where app_state_key = $1 and id = $2 limit 1", [appStateKey, jobId]);
  const row = result.rows[0];
  if (!row) return null;
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
    referenceTitle: row.reference_title,
    outputType: row.output_type,
    finalVideoUrl: row.final_video_url,
    finalVideoHasAudio: row.final_video_has_audio,
    semanticKey: row.semantic_key,
    meaningPatternId: row.meaning_pattern_id,
    productVisualMode: row.product_visual_mode,
    compositionMode: row.composition_mode,
    contentLayerId: row.content_layer_id,
    format: row.format,
    inputUrls: asArray(row.input_urls),
    inputRefs: asArray(row.input_refs),
    diversitySlot: row.diversity_slot ?? null,
    queueName: row.queue_name || "",
    queueStatus: row.queue_status || "",
    queuePriority: row.queue_priority || 0,
    queueAttempts: row.queue_attempts || 0,
    queueMaxAttempts: row.queue_max_attempts || 1,
    queueScheduledAt: row.queue_scheduled_at || null,
    queueLockedAt: row.queue_locked_at || null,
    queueLockOwner: row.queue_lock_owner || "",
    queueLastError: row.queue_last_error || "",
    queueIdempotencyKey: row.queue_idempotency_key || "",
    queueProviderTaskId: row.queue_provider_task_id || "",
    queueMetadata: asObject(row.queue_metadata),
    ...(row.updated_at ? { updatedAt: row.updated_at } : {})
  };
}

async function loadServerJobProject(query, projectId) {
  const row = await loadProjectRow(query, projectId);
  if (!row) return null;
  return {
    ...asObject(row.extra),
    id: row.id,
    name: row.name,
    client: row.client,
    yandexDiskFolder: row.yandex_disk_folder,
    dailyLimit: row.daily_limit,
    usedToday: row.used_today,
    dailyUsageDate: row.daily_usage_date || "",
    projectLimit: row.project_limit,
    usedTotal: row.used_total,
    avatarRoundRobinIndex: row.avatar_round_robin_index,
    ctaOverlay: asObject(row.cta_overlay),
    characters: asArray(row.characters)
  };
}

async function loadServerJobProduct(query, productId) {
  if (!productId) return null;
  const result = await query("select * from studio_products where app_state_key = $1 and id = $2 limit 1", [appStateKey, productId]);
  const row = result.rows[0];
  if (!row) return null;
  return {
    ...asObject(row.extra),
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    description: row.description,
    offer: row.offer,
    components: row.components,
    pains: asArray(row.pains),
    facts: asArray(row.facts),
    forbidden: asArray(row.forbidden),
    aiPassport: asObject(row.ai_passport),
    references: asArray(row.references)
  };
}

async function applyQuotaAccounting(query, currentJob, mergedJob) {
  if (!mergedJob?.projectId) return { job: mergedJob, project: null };
  const projectRow = await loadProjectRow(query, mergedJob.projectId);
  if (!projectRow) return { job: mergedJob, project: null };
  const project = {
    id: projectRow.id,
    yandexDiskFolder: projectRow.yandex_disk_folder,
    dailyLimit: projectRow.daily_limit,
    usedToday: projectRow.used_today,
    dailyUsageDate: projectRow.daily_usage_date || "",
    projectLimit: projectRow.project_limit,
    usedTotal: projectRow.used_total
  };
  const result = patchJobWithQuotaAccounting({ jobs: [currentJob], projects: [project] }, mergedJob.id, mergedJob);
  return {
    job: result.jobs?.[0] || mergedJob,
    project: result.projects?.[0] !== project ? result.projects?.[0] : null
  };
}

async function loadProjectRow(query, projectId) {
  const result = await query("select * from studio_projects where app_state_key = $1 and id = $2 limit 1", [appStateKey, projectId]);
  return result.rows[0] || null;
}

async function updateProjectUsageRow(query, project) {
  await query(
    `update studio_projects
     set used_today = $3, daily_usage_date = $4, used_total = $5, updated_at = now()
     where app_state_key = $1 and id = $2`,
    [appStateKey, project.id, project.usedToday || 0, project.dailyUsageDate || "", project.usedTotal || 0]
  );
}

async function rebuildLegacyMirror(query) {
  const state = await loadNormalizedState(query, appStateKey);
  if (state) await saveLegacyState(query, appStateKey, state);
}

async function loadServerJobAudioLibrary(query) {
  const result = await query("select * from studio_global_audio_assets where app_state_key = $1 order by sort_order asc", [appStateKey]);
  return result.rows.map((row) => ({
    ...asObject(row.extra),
    id: row.id,
    title: row.title,
    fileData: row.file_data
  }));
}

async function loadLegacyJob(query, jobId) {
  const state = await loadLegacyState(query);
  return state?.jobs?.find((item) => item.id === jobId) || null;
}

async function updateRelationalJobRow(query, job) {
  if (!(await hasRelationalJobsTable(query))) return;
  const entries = Object.entries(jobColumns).filter(([key]) => key in job);
  const assignments = entries.map(([, column], index) => `${column} = $${index + 3}${jsonKeys.has(entries[index][0]) ? "::jsonb" : ""}`);
  const values = entries.map(([key]) => jsonKeys.has(key) ? JSON.stringify(job[key] ?? (key === "diversitySlot" ? null : [])) : job[key]);
  const extra = pickExtraFields(job);
  await query(
    `update studio_jobs
     set ${assignments.join(", ")}, extra = $${values.length + 3}::jsonb, updated_at = now()
     where app_state_key = $1 and id = $2`,
    [appStateKey, job.id, ...values, JSON.stringify(extra)]
  );
}

async function loadLegacyState(query) {
  const result = await query("select data from app_state where id = $1 limit 1", [appStateKey]);
  return asObject(result.rows[0]?.data);
}

async function hasRelationalJobsTable(query) {
  const result = await query("select to_regclass('public.studio_jobs') as table_name");
  return Boolean(result.rows[0]?.table_name);
}

function pickExtraFields(job) {
  return Object.fromEntries(Object.entries(asObject(job)).filter(([key]) => key !== "id" && !jobColumns[key]));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
