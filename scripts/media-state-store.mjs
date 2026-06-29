import { randomUUID } from "node:crypto";
import { defaultAppStateKey } from "./app-state-lock.mjs";
import { isPostgresConfigured, queryPostgres } from "./postgres-client.mjs";
import { ensureStateSchema } from "./state-schema.mjs";

export async function appendAudioAssetToState(audio, deps = {}) {
  if (!isDbConfigured(deps)) return normalizeAudioAsset(audio);
  const query = deps.query || queryPostgres;
  const appStateKey = deps.appStateKey || defaultAppStateKey;
  const asset = normalizeAudioAsset(audio);
  await ensureStateSchema(query);
  await query("update studio_global_audio_assets set sort_order = sort_order + 1 where app_state_key = $1", [appStateKey]);
  await query(
    `insert into studio_global_audio_assets
      (app_state_key, id, sort_order, title, mood, duration, file_name, file_type, file_size, file_data, created_at, extra, updated_at)
     values ($1, $2, 0, $3, $4, $5, $6, $7, $8, $9, $10, '{}'::jsonb, now())
     on conflict (app_state_key, id) do update set
       title = excluded.title,
       file_name = excluded.file_name,
       file_type = excluded.file_type,
       file_size = excluded.file_size,
       file_data = excluded.file_data,
       updated_at = now()`,
    [appStateKey, asset.id, asset.title, asset.mood, asset.duration, asset.fileName, asset.fileType, asset.fileSize, asset.fileData, asset.createdAt]
  );
  await query(
    `insert into studio_app_ui_state (app_state_key, selected_audio_id, selected_project_tab, generation_brief, extra, updated_at)
     values ($1, $2, 'audio', '{}'::jsonb, '{}'::jsonb, now())
     on conflict (app_state_key) do update set selected_audio_id = excluded.selected_audio_id, updated_at = now()`,
    [appStateKey, asset.id]
  );
  await upsertLegacyState(query, appStateKey, (state) => ({
    ...state,
    selectedAudioId: asset.id,
    audioLibrary: prependById(state.audioLibrary || [], asset)
  }));
  return asset;
}

export async function appendProductReferenceToState(productId, reference, deps = {}) {
  if (!isDbConfigured(deps) || !productId) return normalizeProductReference(reference);
  const query = deps.query || queryPostgres;
  const appStateKey = deps.appStateKey || defaultAppStateKey;
  const item = normalizeProductReference(reference);
  await ensureStateSchema(query);
  const productResult = await query("select \"references\" from studio_products where app_state_key = $1 and id = $2 limit 1", [appStateKey, productId]);
  const references = prependById(asArray(productResult.rows[0]?.references), item);
  await query(
    "update studio_products set \"references\" = $3::jsonb, updated_at = now() where app_state_key = $1 and id = $2",
    [appStateKey, productId, JSON.stringify(references)]
  );
  await upsertLegacyState(query, appStateKey, (state) => ({
    ...state,
    products: (state.products || []).map((product) => product.id === productId
      ? { ...product, references: prependById(product.references || [], item) }
      : product
    )
  }));
  return item;
}

function normalizeAudioAsset(audio = {}) {
  return {
    id: audio.id || createId("audio"),
    title: audio.title || audio.fileName || "Аудио файл",
    mood: audio.mood || "файл аудио",
    duration: audio.duration || "5 sec",
    fileName: audio.fileName || "",
    fileType: audio.fileType || "",
    fileSize: Number(audio.fileSize || 0),
    fileData: audio.fileData || audio.url || "",
    createdAt: audio.createdAt || new Date().toISOString()
  };
}

function normalizeProductReference(reference = {}) {
  return {
    id: reference.id || createId("product-ref"),
    title: reference.title || reference.imageName || "Референс продукта",
    promptComment: reference.promptComment || "",
    imageName: reference.imageName || "",
    imageData: reference.imageData || reference.url || "",
    createdAt: reference.createdAt || new Date().toISOString()
  };
}

async function upsertLegacyState(query, appStateKey, update) {
  const result = await query("select data from app_state where id = $1 limit 1", [appStateKey]);
  const current = result.rows[0]?.data || {};
  const next = update(current);
  await query(
    `insert into app_state (id, data, updated_at)
     values ($1, $2::jsonb, now())
     on conflict (id) do update set data = excluded.data, updated_at = now()`,
    [appStateKey, JSON.stringify(next)]
  );
}

function prependById(items, item) {
  return [item, ...asArray(items).filter((existing) => existing?.id !== item.id)];
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function isDbConfigured(deps) {
  return deps.isPostgresConfigured ? deps.isPostgresConfigured() : isPostgresConfigured();
}

function createId(prefix) {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}
