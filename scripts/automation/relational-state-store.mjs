import { isPostgresConfigured, queryPostgres, withPostgresTransaction } from "../postgres-client.mjs";
import { defaultAppStateKey, withAppStateRetry } from "../app-state-lock.mjs";
import { lockAppStateMutation } from "../app-state-advisory-lock.mjs";
import { loadNormalizedState, saveJobs, jobKeys } from "../state-relational-store.mjs";
import { compactJobExtraDropKeys } from "../state-jobs-store.mjs";
import { normalizeProjectAutomation } from "../../src/domain/project-automation.js";

const projectKeys = [
  "id", "name", "client", "exportFolder", "yandexDiskFolder", "dailyLimit", "usedToday", "dailyUsageDate", "projectLimit",
  "usedTotal", "companyInfo", "companyAudience", "projectTheme", "niche", "keyScenarios", "audiencePains", "audienceDesires",
  "audienceObjections", "allowedTriggers", "forbiddenTriggers", "hookAggression", "contentRestrictions", "toneOfVoice",
  "restrictions", "style", "lastReferenceUpdate", "avatarRoundRobinIndex", "automation", "ctaOverlay", "references",
  "audioLibrary", "avatarCandidates", "designReferenceCandidates", "characters"
];

const productKeys = ["id", "projectId", "name", "description", "offer", "components", "pains", "facts", "forbidden", "aiPassport", "references"];

const jobColumns = [
  ["projectId", "project_id"], ["productId", "product_id"], ["characterId", "character_id"], ["status", "status"], ["stage", "stage"],
  ["progress", "progress"], ["title", "title"], ["topic", "topic"], ["music", "music"], ["prompt", "prompt"],
  ["referenceTitle", "reference_title"], ["outputType", "output_type"], ["finalVideoUrl", "final_video_url"], ["finalVideoHasAudio", "final_video_has_audio"],
  ["semanticKey", "semantic_key"], ["meaningPatternId", "meaning_pattern_id"], ["productVisualMode", "product_visual_mode"], ["compositionMode", "composition_mode"],
  ["contentLayerId", "content_layer_id"], ["format", "format"], ["inputUrls", "input_urls", "json"], ["inputRefs", "input_refs", "json"],
  ["diversitySlot", "diversity_slot", "json"], ["queueName", "queue_name"], ["queueStatus", "queue_status"], ["queuePriority", "queue_priority"],
  ["queueAttempts", "queue_attempts"], ["queueMaxAttempts", "queue_max_attempts"], ["queueScheduledAt", "queue_scheduled_at"], ["queueLockedAt", "queue_locked_at"],
  ["queueLockOwner", "queue_lock_owner"], ["queueLastError", "queue_last_error"], ["queueIdempotencyKey", "queue_idempotency_key"],
  ["queueProviderTaskId", "queue_provider_task_id"], ["queueMetadata", "queue_metadata", "json"]
];

export function shouldUseRelationalAutomation(deps = {}) {
  if (deps.optimizedPersistence === false || process.env.AUTOMATION_RELATIONAL_MODE === "false") return false;
  if (deps.updateGenerationState) return false;
  const configured = deps.isPostgresConfigured || isPostgresConfigured;
  return configured();
}

export async function loadAutomationState(deps = {}) {
  const query = deps.queryPostgres || queryPostgres;
  return loadNormalizedState(query, deps.appStateKey || defaultAppStateKey, { compactJobs: true });
}

export async function persistAutomationStateDelta(previous, next, deps = {}) {
  const key = deps.appStateKey || defaultAppStateKey;
  const withTransaction = deps.withPostgresTransaction || withPostgresTransaction;
  return withAppStateRetry(() => withTransaction(async (tx) => {
    const changedProjects = changedEntities(previous?.projects, next?.projects);
    const changedProducts = changedEntities(previous?.products, next?.products);
    const changedJobs = changedEntities(previous?.jobs, next?.jobs);
    const projectIds = new Set([
      ...changedProjects.map((project) => project.id),
      ...changedProducts.map((product) => product.projectId),
      ...changedJobs.map((job) => job.projectId)
    ].filter(Boolean));

    for (const projectId of [...projectIds].sort()) await lockProjectRow(tx.query, key, projectId);
    for (const project of changedProjects) await updateProjectDelta(tx.query, key, project);
    for (const product of changedProducts) await updateProductDelta(tx.query, key, product);

    const previousById = new Map((previous?.jobs || []).map((job) => [job.id, job]));
    const newJobs = changedJobs.filter((job) => !previousById.has(job.id));
    const existingJobs = changedJobs.filter((job) => previousById.has(job.id));
    if (newJobs.length) await saveJobs(tx.query, key, newJobs, new Map(), { ignoreConflicts: true });
    for (const job of existingJobs) await updateJobDelta(tx.query, key, job, deps);

    if (previous?.selectedProjectTab !== next?.selectedProjectTab) {
      await tx.query(
        "update studio_app_ui_state set selected_project_tab = $2, updated_at = now() where app_state_key = $1 and selected_project_tab is distinct from $2",
        [key, next?.selectedProjectTab || "project"]
      );
    }
    return { state: next, updatedAt: new Date().toISOString() };
  }));
}

export async function patchAutomationProject(projectId, patch, deps = {}) {
  const key = deps.appStateKey || defaultAppStateKey;
  const withTransaction = deps.withPostgresTransaction || withPostgresTransaction;
  return withAppStateRetry(() => withTransaction(async (tx) => {
    await lockProjectRow(tx.query, key, projectId);
    const result = await tx.query("select automation from studio_projects where app_state_key = $1 and id = $2 limit 1", [key, projectId]);
    if (!result.rows[0]) throw new Error("Project not found");
    const automation = normalizeProjectAutomation({ ...(result.rows[0].automation || {}), ...patch });
    await tx.query("update studio_projects set automation = $3::jsonb, updated_at = now() where app_state_key = $1 and id = $2", [key, projectId, JSON.stringify(automation)]);
    return { automation, updatedAt: new Date().toISOString() };
  }));
}

async function lockProjectRow(query, key, projectId) {
  await lockAppStateMutation(query, key, projectId);
  const result = await query(
    "select id from studio_projects where app_state_key = $1 and id = $2 for update skip locked",
    [key, projectId]
  );
  if (result.rows[0]?.id) return;
  const error = new Error(`Project lock is busy: ${projectId}`);
  error.code = "40001";
  throw error;
}

function changedEntities(previous = [], next = []) {
  const previousById = new Map(previous.filter((item) => item?.id).map((item) => [item.id, item]));
  return next.filter((item) => item?.id && JSON.stringify(previousById.get(item.id)) !== JSON.stringify(item));
}

async function updateProjectDelta(query, key, project) {
  await query(
    `update studio_projects set used_today = $3, daily_usage_date = $4, used_total = $5,
       last_reference_update = $6, avatar_round_robin_index = $7, automation = $8::jsonb,
       cta_overlay = $9::jsonb, "references" = $10::jsonb, audio_library = $11::jsonb,
       avatar_candidates = $12::jsonb, design_reference_candidates = $13::jsonb,
       characters = $14::jsonb, extra = $15::jsonb, updated_at = now()
     where app_state_key = $1 and id = $2`,
    [key, project.id, Number(project.usedToday || 0), project.dailyUsageDate || "", Number(project.usedTotal || 0), project.lastReferenceUpdate || "", Number(project.avatarRoundRobinIndex || 0), JSON.stringify(project.automation || {}), JSON.stringify(project.ctaOverlay || {}), JSON.stringify(project.references || []), JSON.stringify(project.audioLibrary || []), JSON.stringify(project.avatarCandidates || []), JSON.stringify(project.designReferenceCandidates || []), JSON.stringify(project.characters || []), JSON.stringify(pickExtraFields(project, projectKeys))]
  );
}

async function updateProductDelta(query, key, product) {
  await query(
    `update studio_products set name = $3, description = $4, offer = $5, components = $6,
       pains = $7::jsonb, facts = $8::jsonb, forbidden = $9::jsonb, ai_passport = $10::jsonb,
       "references" = $11::jsonb, extra = $12::jsonb, updated_at = now()
     where app_state_key = $1 and id = $2`,
    [key, product.id, product.name || "", product.description || "", product.offer || "", product.components || "", JSON.stringify(product.pains || []), JSON.stringify(product.facts || []), JSON.stringify(product.forbidden || []), JSON.stringify(product.aiPassport || {}), JSON.stringify(product.references || []), JSON.stringify(pickExtraFields(product, productKeys))]
  );
}

async function updateJobDelta(query, key, job, deps = {}) {
  const assignments = [];
  const values = [key, job.id];
  for (const [property, column, type] of jobColumns) {
    if (!(property in job)) continue;
    values.push(type === "json" ? JSON.stringify(job[property] ?? (property === "diversitySlot" ? null : [])) : job[property]);
    assignments.push(`${column} = $${values.length}${type === "json" ? "::jsonb" : ""}`);
  }
  if (!deps.compactJobs || compactJobExtraDropKeys.some((key) => key in job)) {
    values.push(JSON.stringify(pickExtraFields(job, jobKeys)));
    assignments.push(`extra = $${values.length}::jsonb`);
  }
  await query(`update studio_jobs set ${assignments.join(", ")}, updated_at = now() where app_state_key = $1 and id = $2`, values);
}

function pickExtraFields(source, knownKeys) {
  return Object.fromEntries(Object.entries(source || {}).filter(([key]) => !knownKeys.includes(key)));
}
