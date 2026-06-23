import { isPostgresConfigured, withPostgresTransaction } from "./postgres-client.mjs";

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
  diversitySlot: "diversity_slot"
};

const jsonKeys = new Set(["inputUrls", "inputRefs", "diversitySlot"]);

export async function persistServerJobSnapshot(job, deps = {}) {
  if (!job?.id || !(deps.isPostgresConfigured || isPostgresConfigured)()) return false;
  const withTransaction = deps.withPostgresTransaction || withPostgresTransaction;
  return withTransaction(async (tx) => {
    const current = await loadPersistedJob(tx.query, job.id);
    if (!current) return false;
    const merged = { ...current, ...job };
    await updateRelationalJobRow(tx.query, merged);
    await updateLegacyJob(tx.query, merged);
    await touchAppState(tx.query);
    return true;
  });
}

export async function loadPersistedServerJob(jobId, deps = {}) {
  if (!jobId || !(deps.isPostgresConfigured || isPostgresConfigured)()) return null;
  const withTransaction = deps.withPostgresTransaction || withPostgresTransaction;
  return withTransaction((tx) => loadPersistedJob(tx.query, jobId));
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
    diversitySlot: row.diversity_slot ?? null
  };
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

async function updateLegacyJob(query, job) {
  const state = await loadLegacyState(query);
  if (!state?.jobs?.length) return false;
  const jobs = state.jobs.map((item) => item.id === job.id ? { ...item, ...job } : item);
  await query("update app_state set data = $2::jsonb, updated_at = now() where id = $1", [appStateKey, JSON.stringify({ ...state, jobs })]);
  return true;
}

async function loadLegacyState(query) {
  const result = await query("select data from app_state where id = $1 limit 1", [appStateKey]);
  return asObject(result.rows[0]?.data);
}

async function touchAppState(query) {
  await query("update app_state set updated_at = now() where id = $1", [appStateKey]);
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
