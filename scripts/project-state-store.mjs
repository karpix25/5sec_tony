import { updateProjectEntity } from "../src/state/store-projects.js";
import { ensureStateSchema } from "./state-schema.mjs";
import { protectProjectLimitFloor } from "./project-limit-guard.mjs";
import { appendUiTombstones } from "./ui-state-tombstones.mjs";
import { loadAppStateMetadata, touchAppStateMetadata } from "./app-state-metadata.mjs";

const projectKeys = [
  "id", "name", "client", "exportFolder", "yandexDiskFolder", "dailyLimit", "usedToday", "dailyUsageDate", "projectLimit",
  "usedTotal", "companyInfo", "companyAudience", "projectTheme", "niche", "keyScenarios", "audiencePains",
  "audienceDesires", "audienceObjections", "allowedTriggers", "forbiddenTriggers", "hookAggression",
  "contentRestrictions", "toneOfVoice", "restrictions", "style", "lastReferenceUpdate", "avatarRoundRobinIndex",
  "automation", "ctaOverlay", "references", "audioLibrary", "avatarCandidates", "designReferenceCandidates", "characters"
];

const complexPatchKeys = [
  "usedToday", "dailyUsageDate", "usedTotal", "lastReferenceUpdate", "avatarRoundRobinIndex",
  "automation", "ctaOverlay", "references", "audioLibrary", "avatarCandidates", "designReferenceCandidates", "characters"
];

export class ProjectPersistenceError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.name = "ProjectPersistenceError";
    this.status = status;
  }
}

export async function loadProjectBundleForState(query, appStateKey, projectId) {
  const result = await query(
    `select p.*, to_jsonb(product_row) as product_row,
       greatest(
         (select updated_at from app_state where id = $1 limit 1),
         (select max(updated_at) from studio_projects where app_state_key = $1),
         (select max(updated_at) from studio_products where app_state_key = $1),
         (select max(updated_at) from studio_jobs where app_state_key = $1)
       ) as app_state_updated_at,
       greatest(
         (select updated_at from app_state where id = $1 limit 1),
         (select max(updated_at) from studio_projects where app_state_key = $1),
         (select max(updated_at) from studio_products where app_state_key = $1)
       ) as refresh_updated_at,
       greatest(
         (select max(updated_at) from studio_projects where app_state_key = $1),
         (select max(updated_at) from studio_products where app_state_key = $1)
       ) as catalog_updated_at
     from studio_projects p
     left join lateral (
       select * from studio_products
       where app_state_key = p.app_state_key and project_id = p.id
       order by sort_order asc
       limit 1
     ) product_row on true
     where p.app_state_key = $1 and p.id = $2
     limit 1`,
    [appStateKey, projectId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    project: rowToProject(row),
    product: row.product_row ? rowToProduct(row.product_row) : null,
    updatedAt: row.app_state_updated_at || null,
    refreshUpdatedAt: row.refresh_updated_at || row.app_state_updated_at || null,
    catalogUpdatedAt: row.catalog_updated_at || row.refresh_updated_at || row.app_state_updated_at || null
  };
}

export async function saveProjectForState(query, appStateKey, projectId, patch, options = {}) {
  await ensureStateSchema(query);
  const existing = await loadProject(query, appStateKey, projectId);
  if (!existing) throw new ProjectPersistenceError("Project not found", 404);
  const allowProjectLimitDecrease = canDecreaseProjectLimit(existing, options);
  const project = protectProjectLimitFloor({
    ...updateProjectEntity(existing, patch),
    ...pickPatchFields(patch, complexPatchKeys),
    ...pickExtraFields(existing, projectKeys),
    ...pickExtraFields(patch, projectKeys)
  }, existing, { allowProjectLimitDecrease });
  await updateProjectRow(query, appStateKey, projectId, project);
  await touchAppStateMetadata(query, appStateKey);
  return { project, ...await loadAppStateMetadata(query, appStateKey) };
}

function canDecreaseProjectLimit(existing, options = {}) {
  if (!Object.hasOwn(options, "projectLimitBase")) return false;
  return asInteger(options.projectLimitBase, -1) === asInteger(existing?.projectLimit, 0);
}

export async function createProjectForState(query, appStateKey, bundle) {
  await ensureStateSchema(query);
  const project = bundle?.project;
  const product = bundle?.product;
  if (!project?.id) throw new ProjectPersistenceError("project.id is required", 400);
  if (!product?.id || product.projectId !== project.id) {
    throw new ProjectPersistenceError("starter product is required", 400);
  }
  await insertProjectRow(query, appStateKey, project, await getNewProjectSortOrder(query, appStateKey));
  await insertProductRow(query, appStateKey, product, 0);
  const metadata = await loadAppStateMetadata(query, appStateKey);
  return { project, product, ...metadata };
}

export async function deleteProjectForState(query, appStateKey, projectId) {
  await ensureStateSchema(query);
  const count = await query("select count(*)::int as count from studio_projects where app_state_key = $1", [appStateKey]);
  if (Number(count.rows[0]?.count || 0) <= 1) return { deletedProjectId: "", updatedAt: "" };
  const existing = await loadProject(query, appStateKey, projectId);
  if (!existing) throw new ProjectPersistenceError("Project not found", 404);
  const productIds = await loadProjectProductIds(query, appStateKey, projectId);
  await query("delete from studio_projects where app_state_key = $1 and id = $2", [appStateKey, projectId]);
  await selectFirstProject(query, appStateKey);
  await appendUiTombstones(query, appStateKey, { deletedProjectIds: [projectId], deletedProductIds: productIds });
  await touchAppStateMetadata(query, appStateKey);
  return { deletedProjectId: projectId, ...await loadAppStateMetadata(query, appStateKey) };
}

async function loadProjectProductIds(query, appStateKey, projectId) {
  const result = await query(
    "select id from studio_products where app_state_key = $1 and project_id = $2",
    [appStateKey, projectId]
  );
  return result.rows.map((row) => row.id).filter(Boolean);
}

async function loadProject(query, appStateKey, projectId) {
  const result = await query("select * from studio_projects where app_state_key = $1 and id = $2 limit 1", [appStateKey, projectId]);
  return result.rows[0] ? rowToProject(result.rows[0]) : null;
}

async function updateProjectRow(query, appStateKey, projectId, project) {
  await query(
    `update studio_projects set
       name = $3,
       export_folder = $4,
       yandex_disk_folder = $5,
       daily_limit = $6,
       used_today = $7,
       daily_usage_date = $8,
       project_limit = $9,
       used_total = $10,
       company_info = $11,
       company_audience = $12,
       project_theme = $13,
       niche = $14,
       key_scenarios = $15,
       audience_pains = $16,
       audience_desires = $17,
       audience_objections = $18,
       allowed_triggers = $19,
       forbidden_triggers = $20,
       hook_aggression = $21,
       content_restrictions = $22,
       tone_of_voice = $23,
       restrictions = $24,
       style = $25,
       automation = $26::jsonb,
       cta_overlay = $27::jsonb,
       extra = $28::jsonb,
       updated_at = now()
     where app_state_key = $1 and id = $2`,
    [
      appStateKey,
      projectId,
      project.name || "",
      project.exportFolder || "",
      project.yandexDiskFolder || "",
      asInteger(project.dailyLimit, 20),
      asInteger(project.usedToday, 0),
      project.dailyUsageDate || "",
      asInteger(project.projectLimit, 500),
      asInteger(project.usedTotal, 0),
      project.companyInfo || "",
      project.companyAudience || "",
      project.projectTheme || "",
      project.niche || "",
      project.keyScenarios || "",
      project.audiencePains || "",
      project.audienceDesires || "",
      project.audienceObjections || "",
      project.allowedTriggers || "",
      project.forbiddenTriggers || "",
      project.hookAggression || "",
      project.contentRestrictions || "",
      project.toneOfVoice || "",
      project.restrictions || "",
      project.style || "",
      toJson(asObject(project.automation)),
      toJson(asObject(project.ctaOverlay)),
      toJson(pickExtraFields(project, projectKeys))
    ]
  );
}

async function insertProjectRow(query, appStateKey, project, sortOrder) {
  await query(
    `insert into studio_projects
      (app_state_key, id, sort_order, name, client, export_folder, yandex_disk_folder, daily_limit, used_today, daily_usage_date, project_limit, used_total, company_info, company_audience, project_theme, niche, key_scenarios, audience_pains, audience_desires, audience_objections, allowed_triggers, forbidden_triggers, hook_aggression, content_restrictions, tone_of_voice, restrictions, style, last_reference_update, avatar_round_robin_index, automation, cta_overlay, "references", audio_library, avatar_candidates, design_reference_candidates, characters, extra, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30::jsonb, $31::jsonb, $32::jsonb, $33::jsonb, $34::jsonb, $35::jsonb, $36::jsonb, $37::jsonb, now())`,
    [
      appStateKey,
      project.id,
      sortOrder,
      project.name || "",
      project.client || "",
      project.exportFolder || "",
      project.yandexDiskFolder || "",
      asInteger(project.dailyLimit, 20),
      asInteger(project.usedToday, 0),
      project.dailyUsageDate || "",
      asInteger(project.projectLimit, 500),
      asInteger(project.usedTotal, 0),
      project.companyInfo || "",
      project.companyAudience || "",
      project.projectTheme || "",
      project.niche || "",
      project.keyScenarios || "",
      project.audiencePains || "",
      project.audienceDesires || "",
      project.audienceObjections || "",
      project.allowedTriggers || "",
      project.forbiddenTriggers || "",
      project.hookAggression || "",
      project.contentRestrictions || "",
      project.toneOfVoice || "",
      project.restrictions || "",
      project.style || "",
      project.lastReferenceUpdate || "",
      asInteger(project.avatarRoundRobinIndex, 0),
      toJson(asObject(project.automation)),
      toJson(asObject(project.ctaOverlay)),
      toJson(asArray(project.references)),
      toJson(asArray(project.audioLibrary)),
      toJson(asArray(project.avatarCandidates)),
      toJson(asArray(project.designReferenceCandidates)),
      toJson(asArray(project.characters)),
      toJson(pickExtraFields(project, projectKeys))
    ]
  );
}

async function insertProductRow(query, appStateKey, product, sortOrder) {
  await query(
    `insert into studio_products
      (app_state_key, id, project_id, sort_order, name, description, offer, components, pains, facts, forbidden, ai_passport, "references", extra, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb, $13::jsonb, $14::jsonb, now())`,
    [
      appStateKey,
      product.id,
      product.projectId,
      sortOrder,
      product.name || "",
      product.description || "",
      product.offer || "",
      product.components || "",
      toJson(asArray(product.pains)),
      toJson(asArray(product.facts)),
      toJson(asArray(product.forbidden)),
      toJson(asObject(product.aiPassport)),
      toJson(asArray(product.references)),
      toJson(pickExtraFields(product, ["id", "projectId", "name", "description", "offer", "components", "pains", "facts", "forbidden", "aiPassport", "references"]))
    ]
  );
}

async function getNewProjectSortOrder(query, appStateKey) {
  const result = await query(
    "select coalesce(min(sort_order), 0) - 1 as next_order from studio_projects where app_state_key = $1",
    [appStateKey]
  );
  return Number(result.rows[0]?.next_order ?? 0);
}

async function selectFirstProject(query, appStateKey) {
  const result = await query(
    `select p.id as project_id, pr.id as product_id, p."references", p.characters
     from studio_projects p
     left join lateral (
       select id from studio_products where app_state_key = p.app_state_key and project_id = p.id order by sort_order asc limit 1
     ) pr on true
     where p.app_state_key = $1
     order by p.sort_order asc
     limit 1`,
    [appStateKey]
  );
  const row = result.rows[0];
  if (!row) return;
  await selectProjectIds(query, appStateKey, {
    projectId: row.project_id,
    productId: row.product_id || "",
    referenceId: asArray(row.references)[0]?.id || "",
    characterId: asArray(row.characters)[0]?.id || ""
  });
}

async function selectProjectIds(query, appStateKey, selection) {
  await query(
    `insert into studio_app_ui_state
      (app_state_key, selected_project_id, selected_product_id, selected_reference_id, selected_character_id, selected_project_tab, updated_at)
     values ($1, $2, $3, $4, $5, 'project', now())
     on conflict (app_state_key)
     do update set
       selected_project_id = excluded.selected_project_id,
       selected_product_id = excluded.selected_product_id,
       selected_reference_id = excluded.selected_reference_id,
       selected_character_id = excluded.selected_character_id,
       selected_project_tab = excluded.selected_project_tab,
       updated_at = now()`,
    [appStateKey, selection.projectId, selection.productId, selection.referenceId, selection.characterId]
  );
}

function rowToProject(row) {
  return {
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
  };
}

function rowToProduct(row) {
  return {
    ...asObject(row.extra),
    id: row.id,
    projectId: row.project_id,
    sortOrder: row.sort_order,
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

function pickExtraFields(source, knownKeys) {
  return Object.fromEntries(Object.entries(asObject(source)).filter(([key]) => !knownKeys.includes(key)));
}

function pickPatchFields(source, allowedKeys) {
  return Object.fromEntries(allowedKeys.filter((key) => Object.hasOwn(asObject(source), key)).map((key) => [key, source[key]]));
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
