import { ensureStateSchema } from "./state-schema.mjs";
import { isServerProtectedJob, mergeClientJobWithServerJob } from "./job-state-merge-policy.mjs";
import { syncAudioLibraryRefreshReminder } from "./audio-refresh-reminders.mjs";
import { normalizeStateJobIds } from "../src/domain/job-identity.js";

const uiKeys = [
  "selectedProjectId",
  "selectedProductId",
  "selectedReferenceId",
  "selectedCharacterId",
  "selectedAudioId",
  "selectedProjectTab",
  "generationBrief",
  "freePrompt",
  "projects",
  "products",
  "jobs",
  "audioLibrary",
  "hookLibrary",
  "reelsResearch"
];

const projectKeys = [
  "id", "name", "client", "exportFolder", "yandexDiskFolder", "dailyLimit", "usedToday", "dailyUsageDate", "projectLimit",
  "usedTotal", "companyInfo", "companyAudience", "projectTheme", "niche", "keyScenarios", "audiencePains",
  "audienceDesires", "audienceObjections", "allowedTriggers", "forbiddenTriggers", "hookAggression",
  "contentRestrictions", "toneOfVoice", "restrictions", "style", "lastReferenceUpdate", "avatarRoundRobinIndex",
  "automation", "ctaOverlay", "references", "audioLibrary", "avatarCandidates", "designReferenceCandidates", "characters"
];

const productKeys = [
  "id", "projectId", "name", "description", "offer", "components", "pains", "facts", "forbidden", "aiPassport", "references"
];

const jobKeys = [
  "id", "projectId", "productId", "characterId", "status", "stage", "progress", "title", "topic", "music", "prompt",
  "referenceTitle", "outputType", "finalVideoUrl", "finalVideoHasAudio", "semanticKey", "meaningPatternId",
  "productVisualMode", "compositionMode", "contentLayerId", "format", "inputUrls", "inputRefs", "diversitySlot",
  "queueName", "queueStatus", "queuePriority", "queueAttempts", "queueMaxAttempts", "queueScheduledAt", "queueLockedAt",
  "queueLockOwner", "queueLastError", "queueIdempotencyKey", "queueProviderTaskId", "queueMetadata"
];

const audioKeys = [
  "id", "title", "mood", "duration", "fileName", "fileType", "fileSize", "fileData", "createdAt"
];

const hookVersionKeys = ["id", "title", "status", "createdAt", "sourceType", "hooks"];
const hookItemKeys = ["id", "text", "enabled", "tags", "aggression"];

export async function loadNormalizedState(query, appStateKey) {
  await ensureStateSchema(query);
  if (!(await hasNormalizedState(query, appStateKey))) return null;

  const ui = await loadUiState(query, appStateKey);
  const projects = await loadProjects(query, appStateKey);
  const products = await loadProducts(query, appStateKey);
  const jobs = await loadJobs(query, appStateKey);
  const audioLibrary = await loadGlobalAudio(query, appStateKey);
  const hookLibrary = await loadHookLibrary(query, appStateKey);
  const reelsResearch = await loadReelsResearch(query, appStateKey);

  const uiExtra = asObject(ui?.extra);
  return {
    ...uiExtra,
    projects,
    products,
    jobs,
    audioLibrary,
    hookLibrary,
    reelsResearch,
    selectedProjectId: ui?.selected_project_id || "",
    selectedProductId: ui?.selected_product_id || "",
    selectedReferenceId: ui?.selected_reference_id || "",
    selectedCharacterId: ui?.selected_character_id || "",
    selectedAudioId: ui?.selected_audio_id || "",
    selectedProjectTab: ui?.selected_project_tab || "project",
    generationBrief: asObject(ui?.generation_brief),
    freePrompt: ui?.free_prompt || ""
  };
}

export async function saveNormalizedState(query, appStateKey, state) {
  await ensureStateSchema(query);
  const existingProjectsById = await loadExistingProjectsById(query, appStateKey);
  const existingJobsById = await loadExistingJobsById(query, appStateKey);
  const normalizedState = prepareStateForRelationalSave(state, existingJobsById, existingProjectsById);
  await clearNormalizedState(query, appStateKey);

  await saveUiState(query, appStateKey, normalizedState);
  await saveProjects(query, appStateKey, normalizedState.projects || []);
  await saveProducts(query, appStateKey, normalizedState.products || []);
  await saveJobs(query, appStateKey, normalizedState.jobs || [], existingJobsById);
  await saveGlobalAudio(query, appStateKey, normalizedState.audioLibrary || []);
  await syncAudioLibraryRefreshReminder(normalizedState.audioLibrary || [], { query, appStateKey });
  await saveHookLibrary(query, appStateKey, normalizedState.hookLibrary || { activeVersionId: "", versions: [] });
  await saveReelsResearch(query, appStateKey, normalizedState.reelsResearch);
  return normalizedState;
}

export async function loadLegacyState(query, appStateKey) {
  const result = await query("select data, updated_at from app_state where id = $1 limit 1", [appStateKey]);
  return result.rows[0]?.data || null;
}

export async function saveLegacyState(query, appStateKey, state) {
  return query(
    `insert into app_state (id, data, updated_at)
     values ($1, $2::jsonb, now())
     on conflict (id)
     do update set data = excluded.data, updated_at = now()
     returning updated_at`,
    [appStateKey, JSON.stringify(state)]
  );
}

async function hasNormalizedState(query, appStateKey) {
  const result = await query(
    `select (
       exists(select 1 from studio_app_ui_state where app_state_key = $1)
       or exists(select 1 from studio_projects where app_state_key = $1)
       or exists(select 1 from studio_products where app_state_key = $1)
       or exists(select 1 from studio_jobs where app_state_key = $1)
       or exists(select 1 from studio_global_audio_assets where app_state_key = $1)
       or exists(select 1 from studio_hook_versions where app_state_key = $1)
       or exists(select 1 from studio_reels_research where app_state_key = $1)
     ) as present`,
    [appStateKey]
  );
  return Boolean(result.rows[0]?.present);
}

async function loadUiState(query, appStateKey) {
  const result = await query("select * from studio_app_ui_state where app_state_key = $1 limit 1", [appStateKey]);
  return result.rows[0] || null;
}

async function loadProjects(query, appStateKey) {
  const result = await query("select * from studio_projects where app_state_key = $1 order by sort_order asc", [appStateKey]);
  return result.rows.map((row) => ({
    ...asObject(row.extra),
    id: row.id,
    name: row.name,
    client: row.client,
    exportFolder: row.export_folder,
    yandexDiskFolder: row.yandex_disk_folder,
    dailyLimit: row.daily_limit,
    usedToday: row.used_today,
    dailyUsageDate: row.daily_usage_date || "",
    projectLimit: row.project_limit,
    usedTotal: row.used_total,
    companyInfo: row.company_info,
    companyAudience: row.company_audience,
    projectTheme: row.project_theme,
    niche: row.niche,
    keyScenarios: row.key_scenarios,
    audiencePains: row.audience_pains,
    audienceDesires: row.audience_desires,
    audienceObjections: row.audience_objections,
    allowedTriggers: row.allowed_triggers,
    forbiddenTriggers: row.forbidden_triggers,
    hookAggression: row.hook_aggression,
    contentRestrictions: row.content_restrictions,
    toneOfVoice: row.tone_of_voice,
    restrictions: row.restrictions,
    style: row.style,
    lastReferenceUpdate: row.last_reference_update,
    avatarRoundRobinIndex: row.avatar_round_robin_index,
    automation: asObject(row.automation),
    ctaOverlay: asObject(row.cta_overlay),
    references: asArray(row.references),
    audioLibrary: asArray(row.audio_library),
    avatarCandidates: asArray(row.avatar_candidates),
    designReferenceCandidates: asArray(row.design_reference_candidates),
    characters: asArray(row.characters)
  }));
}

async function loadProducts(query, appStateKey) {
  const result = await query("select * from studio_products where app_state_key = $1 order by sort_order asc", [appStateKey]);
  return result.rows.map((row) => ({
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
  }));
}

async function loadJobs(query, appStateKey) {
  const result = await query("select * from studio_jobs where app_state_key = $1 order by sort_order asc", [appStateKey]);
  return result.rows.map(mapJobRow);
}

async function loadExistingJobsById(query, appStateKey) {
  const jobs = await loadJobs(query, appStateKey);
  return new Map(jobs.filter((job) => job.id).map((job) => [job.id, job]));
}

async function loadExistingProjectsById(query, appStateKey) {
  const projects = await loadProjects(query, appStateKey);
  return new Map(projects.filter((project) => project.id).map((project) => [project.id, project]));
}

function mapJobRow(row) {
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
    queueMetadata: asObject(row.queue_metadata)
  };
}

function prepareStateForRelationalSave(state, existingJobsById, existingProjectsById) {
  const normalizedState = normalizeStateJobIds(state);
  const projects = mergeProjectsForRelationalSave(normalizedState, existingProjectsById);
  const jobs = mergeJobsForRelationalSave(normalizedState, existingJobsById);
  return { ...normalizedState, projects, jobs };
}

function mergeProjectsForRelationalSave(state, existingProjectsById) {
  return asArray(state.projects).map((project) =>
    preserveServerProjectLimit(project, existingProjectsById.get(project?.id))
  );
}

function preserveServerProjectLimit(project, existingProject) {
  if (!project || !existingProject) return project;
  const incomingLimit = asInteger(project.projectLimit, 500);
  const serverLimit = asInteger(existingProject.projectLimit, 500);
  const serverUsedTotal = asInteger(existingProject.usedTotal, 0);
  if (serverUsedTotal > 0 && serverLimit >= serverUsedTotal && incomingLimit < serverUsedTotal) {
    return { ...project, projectLimit: serverLimit };
  }
  return project;
}

function mergeJobsForRelationalSave(state, existingJobsById) {
  const seenJobIds = new Set();
  const jobs = asArray(state.jobs).map((job) => {
    if (job?.id) seenJobIds.add(job.id);
    return mergeClientJobWithServerJob(job, existingJobsById.get(job?.id));
  });
  for (const job of existingJobsById.values()) {
    if (!seenJobIds.has(job.id) && shouldKeepMissingServerJob(job, state)) jobs.push(job);
  }
  return jobs;
}

function shouldKeepMissingServerJob(job, state) {
  if (!isServerProtectedJob(job)) return false;
  const projectIds = new Set(asArray(state.projects).map((project) => project?.id).filter(Boolean));
  const productIds = new Set(asArray(state.products).map((product) => product?.id).filter(Boolean));
  return projectIds.has(job.projectId) && productIds.has(job.productId);
}

async function loadGlobalAudio(query, appStateKey) {
  const result = await query("select * from studio_global_audio_assets where app_state_key = $1 order by sort_order asc", [appStateKey]);
  return result.rows.map((row) => ({
    ...asObject(row.extra),
    id: row.id,
    title: row.title,
    mood: row.mood,
    duration: row.duration,
    fileName: row.file_name,
    fileType: row.file_type,
    fileSize: Number(row.file_size || 0),
    fileData: row.file_data,
    createdAt: row.created_at
  }));
}

async function loadHookLibrary(query, appStateKey) {
  const stateResult = await query("select * from studio_hook_library_state where app_state_key = $1 limit 1", [appStateKey]);
  const versionsResult = await query("select * from studio_hook_versions where app_state_key = $1 order by sort_order asc", [appStateKey]);
  const itemsResult = await query("select * from studio_hook_items where app_state_key = $1 order by sort_order asc", [appStateKey]);
  const itemsByVersion = new Map();
  itemsResult.rows.forEach((row) => {
    const items = itemsByVersion.get(row.version_id) || [];
    items.push({
      ...asObject(row.extra),
      id: row.id,
      text: row.text,
      enabled: row.enabled,
      tags: asArray(row.tags),
      aggression: row.aggression
    });
    itemsByVersion.set(row.version_id, items);
  });
  return {
    activeVersionId: stateResult.rows[0]?.active_version_id || "",
    versions: versionsResult.rows.map((row) => ({
      ...asObject(row.extra),
      id: row.id,
      title: row.title,
      status: row.status,
      createdAt: row.created_at,
      sourceType: row.source_type,
      hooks: itemsByVersion.get(row.id) || []
    }))
  };
}

async function loadReelsResearch(query, appStateKey) {
  const result = await query("select * from studio_reels_research where app_state_key = $1 limit 1", [appStateKey]);
  const row = result.rows[0];
  if (!row) return null;
  return {
    ...asObject(row.extra),
    updatedAt: row.updated_at,
    accounts: asArray(row.accounts),
    modelAnalysis: row.model_analysis,
    modelWriting: row.model_writing,
    errors: asArray(row.errors),
    videos: asArray(row.videos),
    summary: asObject(row.summary)
  };
}

async function clearNormalizedState(query, appStateKey) {
  await query("delete from studio_hook_items where app_state_key = $1", [appStateKey]);
  await query("delete from studio_hook_versions where app_state_key = $1", [appStateKey]);
  await query("delete from studio_hook_library_state where app_state_key = $1", [appStateKey]);
  await query("delete from studio_reels_research where app_state_key = $1", [appStateKey]);
  await query("delete from studio_global_audio_assets where app_state_key = $1", [appStateKey]);
  await query("delete from studio_jobs where app_state_key = $1", [appStateKey]);
  await query("delete from studio_products where app_state_key = $1", [appStateKey]);
  await query("delete from studio_projects where app_state_key = $1", [appStateKey]);
  await query("delete from studio_app_ui_state where app_state_key = $1", [appStateKey]);
}

async function saveUiState(query, appStateKey, state) {
  await query(
    `insert into studio_app_ui_state
      (app_state_key, selected_project_id, selected_product_id, selected_reference_id, selected_character_id, selected_audio_id, selected_project_tab, generation_brief, free_prompt, extra, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10::jsonb, now())`,
    [appStateKey, state.selectedProjectId || "", state.selectedProductId || "", state.selectedReferenceId || "", state.selectedCharacterId || "", state.selectedAudioId || "", state.selectedProjectTab || "project", toJson(asObject(state.generationBrief)), state.freePrompt || "", toJson(pickExtraFields(state, uiKeys))]
  );
}

async function saveProjects(query, appStateKey, projects) {
  for (const [index, project] of projects.entries()) {
    await query(
      `insert into studio_projects
        (app_state_key, id, sort_order, name, client, export_folder, yandex_disk_folder, daily_limit, used_today, daily_usage_date, project_limit, used_total, company_info, company_audience, project_theme, niche, key_scenarios, audience_pains, audience_desires, audience_objections, allowed_triggers, forbidden_triggers, hook_aggression, content_restrictions, tone_of_voice, restrictions, style, last_reference_update, avatar_round_robin_index, automation, cta_overlay, "references", audio_library, avatar_candidates, design_reference_candidates, characters, extra, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30::jsonb, $31::jsonb, $32::jsonb, $33::jsonb, $34::jsonb, $35::jsonb, $36::jsonb, $37::jsonb, now())`,
      [appStateKey, project.id, index, project.name || "", project.client || "", project.exportFolder || "", project.yandexDiskFolder || "", asInteger(project.dailyLimit, 20), asInteger(project.usedToday, 0), project.dailyUsageDate || "", asInteger(project.projectLimit, 500), asInteger(project.usedTotal, 0), project.companyInfo || "", project.companyAudience || "", project.projectTheme || "", project.niche || "", project.keyScenarios || "", project.audiencePains || "", project.audienceDesires || "", project.audienceObjections || "", project.allowedTriggers || "", project.forbiddenTriggers || "", project.hookAggression || "", project.contentRestrictions || "", project.toneOfVoice || "", project.restrictions || "", project.style || "", project.lastReferenceUpdate || "", asInteger(project.avatarRoundRobinIndex, 0), toJson(asObject(project.automation)), toJson(asObject(project.ctaOverlay)), toJson(asArray(project.references)), toJson(asArray(project.audioLibrary)), toJson(asArray(project.avatarCandidates)), toJson(asArray(project.designReferenceCandidates)), toJson(asArray(project.characters)), toJson(pickExtraFields(project, projectKeys))]
    );
  }
}

async function saveProducts(query, appStateKey, products) {
  for (const [index, product] of products.entries()) {
    await query(
      `insert into studio_products
        (app_state_key, id, project_id, sort_order, name, description, offer, components, pains, facts, forbidden, ai_passport, "references", extra, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb, $13::jsonb, $14::jsonb, now())`,
      [appStateKey, product.id, product.projectId, index, product.name || "", product.description || "", product.offer || "", product.components || "", toJson(asArray(product.pains)), toJson(asArray(product.facts)), toJson(asArray(product.forbidden)), toJson(asObject(product.aiPassport)), toJson(asArray(product.references)), toJson(pickExtraFields(product, productKeys))]
    );
  }
}

async function saveJobs(query, appStateKey, jobs, existingJobsById = new Map()) {
  for (const [index, job] of jobs.entries()) {
    const mergedJob = mergeClientJobWithServerJob(job, existingJobsById.get(job.id));
    await query(
      `insert into studio_jobs
        (app_state_key, id, sort_order, project_id, product_id, character_id, status, stage, progress, title, topic, music, prompt, reference_title, output_type, final_video_url, final_video_has_audio, semantic_key, meaning_pattern_id, product_visual_mode, composition_mode, content_layer_id, format, input_urls, input_refs, diversity_slot, queue_name, queue_status, queue_priority, queue_attempts, queue_max_attempts, queue_scheduled_at, queue_locked_at, queue_lock_owner, queue_last_error, queue_idempotency_key, queue_provider_task_id, queue_metadata, extra, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24::jsonb, $25::jsonb, $26::jsonb, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38::jsonb, $39::jsonb, now())`,
      [appStateKey, mergedJob.id, index, mergedJob.projectId, mergedJob.productId, mergedJob.characterId || "", mergedJob.status || "", mergedJob.stage || "", asInteger(mergedJob.progress, 0), mergedJob.title || "", mergedJob.topic || "", mergedJob.music || "", mergedJob.prompt || "", mergedJob.referenceTitle || "", mergedJob.outputType || "", mergedJob.finalVideoUrl || "", Boolean(mergedJob.finalVideoHasAudio), mergedJob.semanticKey || "", mergedJob.meaningPatternId || "", mergedJob.productVisualMode || "", mergedJob.compositionMode || "", mergedJob.contentLayerId || "", mergedJob.format || "", toJson(asArray(mergedJob.inputUrls)), toJson(asArray(mergedJob.inputRefs)), toJson(mergedJob.diversitySlot ?? null), mergedJob.queueName || "generation", mergedJob.queueStatus || "", asInteger(mergedJob.queuePriority, 0), asInteger(mergedJob.queueAttempts, 0), asInteger(mergedJob.queueMaxAttempts, 1), mergedJob.queueScheduledAt || null, mergedJob.queueLockedAt || null, mergedJob.queueLockOwner || "", mergedJob.queueLastError || "", mergedJob.queueIdempotencyKey || "", mergedJob.queueProviderTaskId || "", toJson(asObject(mergedJob.queueMetadata)), toJson(pickExtraFields(mergedJob, jobKeys))]
    );
  }
}

async function saveGlobalAudio(query, appStateKey, audioLibrary) {
  for (const [index, asset] of audioLibrary.entries()) {
    await query(
      `insert into studio_global_audio_assets
        (app_state_key, id, sort_order, title, mood, duration, file_name, file_type, file_size, file_data, created_at, extra, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, now())`,
      [appStateKey, asset.id, index, asset.title || "", asset.mood || "", asset.duration || "", asset.fileName || "", asset.fileType || "", asInteger(asset.fileSize, 0), asset.fileData || "", asset.createdAt || "", toJson(pickExtraFields(asset, audioKeys))]
    );
  }
}

async function saveHookLibrary(query, appStateKey, hookLibrary) {
  await query(
    `insert into studio_hook_library_state (app_state_key, active_version_id, updated_at)
     values ($1, $2, now())`,
    [appStateKey, hookLibrary.activeVersionId || ""]
  );
  for (const [versionIndex, version] of asArray(hookLibrary.versions).entries()) {
    await query(
      `insert into studio_hook_versions
        (app_state_key, id, sort_order, title, status, created_at, source_type, extra, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, now())`,
      [appStateKey, version.id, versionIndex, version.title || "", version.status || "test", version.createdAt || "", version.sourceType || "text", toJson(pickExtraFields(version, hookVersionKeys))]
    );
    for (const [itemIndex, item] of asArray(version.hooks).entries()) {
      await query(
        `insert into studio_hook_items
          (app_state_key, id, version_id, sort_order, text, enabled, tags, aggression, extra, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9::jsonb, now())`,
        [appStateKey, item.id, version.id, itemIndex, item.text || "", item.enabled !== false, toJson(asArray(item.tags)), item.aggression || "", toJson(pickExtraFields(item, hookItemKeys))]
      );
    }
  }
}

async function saveReelsResearch(query, appStateKey, reelsResearch) {
  if (!reelsResearch) return;
  await query(
    `insert into studio_reels_research
      (app_state_key, updated_at, accounts, model_analysis, model_writing, errors, videos, summary, extra, touched_at)
     values ($1, $2, $3::jsonb, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, now())`,
    [appStateKey, reelsResearch.updatedAt || "", toJson(asArray(reelsResearch.accounts)), reelsResearch.modelAnalysis || "", reelsResearch.modelWriting || "", toJson(asArray(reelsResearch.errors)), toJson(asArray(reelsResearch.videos)), toJson(asObject(reelsResearch.summary)), toJson(pickExtraFields(reelsResearch, ["updatedAt", "accounts", "modelAnalysis", "modelWriting", "errors", "videos", "summary"]))]
  );
}

function pickExtraFields(source, knownKeys) {
  return Object.fromEntries(Object.entries(asObject(source)).filter(([key]) => !knownKeys.includes(key)));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : fallback;
}

function toJson(value) {
  return JSON.stringify(value);
}
