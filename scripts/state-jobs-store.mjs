export const compactJobExtraDropKeys = [
  "serverJobContext", "promptContract", "imagePromptContract", "aiTrace", "imagePromptPackage",
  "attentionMap", "qaReview", "creativeQuality", "visualBrief", "contentScript", "creativeBrief",
  "diversitySlot", "hookIntelligence", "layoutContentPlan", "aiPlan", "finalContent", "productFact",
  "curiosityAngle"
];

export async function loadJobs(query, appStateKey, options = {}) {
  const scope = buildJobScope(appStateKey, options);
  const compactParams = [...scope.params, compactJobExtraDropKeys];
  const compactSql = `select id, project_id, product_id, character_id, status, stage, progress, title, topic, music, ''::text as prompt, reference_title, output_type, final_video_url, final_video_has_audio, semantic_key, meaning_pattern_id, product_visual_mode, composition_mode, content_layer_id, format, input_urls, input_refs, diversity_slot, queue_name, queue_status, queue_priority, queue_attempts, queue_max_attempts, queue_scheduled_at, queue_locked_at, queue_lock_owner, queue_last_error, queue_idempotency_key, queue_provider_task_id, queue_metadata, extra - $${compactParams.length}::text[] as extra from studio_jobs where ${scope.where} order by sort_order asc, id asc`;
  const fullSql = `select * from studio_jobs where ${scope.where} order by sort_order asc, id asc`;
  const paged = Number.isInteger(options.limit) && options.limit >= 0;
  const baseSql = options.compactJobs ? compactSql : fullSql;
  const params = options.compactJobs ? compactParams : [...scope.params];
  const limitIndex = params.length + 1;
  const offsetIndex = limitIndex + 1;
  const sql = paged ? `${baseSql} limit $${limitIndex} offset $${offsetIndex}` : baseSql;
  if (paged) params.push(options.limit, Math.max(0, options.offset || 0));
  const result = await query(sql, params);
  return result.rows.map(mapJobRow);
}

export async function loadJobsPage(query, appStateKey, options = {}) {
  const limit = Math.min(Math.max(Number(options.limit) || 500, 1), 500);
  const offset = Math.max(Number(options.offset) || 0, 0);
  const scope = buildJobScope(appStateKey, options);
  const countResult = await query(`select count(*)::int as count from studio_jobs where ${scope.where}`, scope.params);
  const jobs = await loadJobs(query, appStateKey, { ...options, compactJobs: true, limit, offset });
  const total = Number(countResult.rows[0]?.count || 0);
  const nextOffset = offset + jobs.length;
  return { jobs, total, offset, limit, nextOffset, hasMore: nextOffset < total };
}

function buildJobScope(appStateKey, options = {}) {
  const params = [appStateKey];
  const conditions = ["app_state_key = $1"];
  if (options.projectId) {
    params.push(options.projectId);
    conditions.push(`project_id = $${params.length}`);
  }
  if (options.productId) {
    params.push(options.productId);
    conditions.push(`product_id = $${params.length}`);
  }
  return { params, where: conditions.join(" and ") };
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

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
