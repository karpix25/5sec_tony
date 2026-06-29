import { createProductEntity } from "../src/state/factories.js";
import { ensureStateSchema } from "./state-schema.mjs";
import { loadLegacyState, loadNormalizedState, saveLegacyState } from "./state-relational-store.mjs";

const productKeys = [
  "id", "projectId", "name", "description", "offer", "components", "pains", "facts", "forbidden", "aiPassport", "references"
];

export class ProductPersistenceError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.name = "ProductPersistenceError";
    this.status = status;
  }
}

export async function saveProductForState(query, appStateKey, productPayload, options = {}) {
  await ensureStateSchema(query);
  const mode = options.mode || "update";
  const existing = productPayload.id ? await loadProduct(query, appStateKey, productPayload.id) : null;
  if (mode === "update" && !existing) {
    throw new ProductPersistenceError("Product not found", 404);
  }

  const projectId = productPayload.projectId || existing?.projectId || "";
  if (!projectId) throw new ProductPersistenceError("product.projectId is required", 400);
  await assertProjectExists(query, appStateKey, projectId);

  const entity = createProductEntity(projectId, productPayload.name || existing?.name || "Новый продукт", {
    ...(existing || {}),
    ...productPayload,
    id: productPayload.id || existing?.id
  });
  const product = {
    ...pickExtraFields(existing, productKeys),
    ...entity,
    ...pickExtraFields(productPayload, productKeys)
  };
  const sortOrder = existing?.sortOrder ?? await getNewProductSortOrder(query, appStateKey, projectId);
  await upsertProduct(query, appStateKey, product, sortOrder);
  if (options.selectProduct) await selectProduct(query, appStateKey, product);
  const updatedAt = await rebuildLegacyMirror(query, appStateKey);
  return { product, updatedAt };
}

async function assertProjectExists(query, appStateKey, projectId) {
  const result = await query(
    "select id from studio_projects where app_state_key = $1 and id = $2 limit 1",
    [appStateKey, projectId]
  );
  if (!result.rows[0]) throw new ProductPersistenceError("Product project not found", 404);
}

async function loadProduct(query, appStateKey, productId) {
  const result = await query(
    "select * from studio_products where app_state_key = $1 and id = $2 limit 1",
    [appStateKey, productId]
  );
  return result.rows[0] ? rowToProduct(result.rows[0]) : null;
}

async function getNewProductSortOrder(query, appStateKey, projectId) {
  const result = await query(
    "select coalesce(min(sort_order), 0) - 1 as next_order from studio_products where app_state_key = $1 and project_id = $2",
    [appStateKey, projectId]
  );
  return Number(result.rows[0]?.next_order ?? 0);
}

async function upsertProduct(query, appStateKey, product, sortOrder) {
  await query(
    `insert into studio_products
      (app_state_key, id, project_id, sort_order, name, description, offer, components, pains, facts, forbidden, ai_passport, "references", extra, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb, $13::jsonb, $14::jsonb, now())
     on conflict (app_state_key, id)
     do update set
       project_id = excluded.project_id,
       sort_order = excluded.sort_order,
       name = excluded.name,
       description = excluded.description,
       offer = excluded.offer,
       components = excluded.components,
       pains = excluded.pains,
       facts = excluded.facts,
       forbidden = excluded.forbidden,
       ai_passport = excluded.ai_passport,
       "references" = excluded."references",
       extra = excluded.extra,
       updated_at = now()`,
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
      toJson(pickExtraFields(product, productKeys))
    ]
  );
}

async function selectProduct(query, appStateKey, product) {
  await query(
    `insert into studio_app_ui_state (app_state_key, selected_project_id, selected_product_id, updated_at)
     values ($1, $2, $3, now())
     on conflict (app_state_key)
     do update set
       selected_project_id = excluded.selected_project_id,
       selected_product_id = excluded.selected_product_id,
       updated_at = now()`,
    [appStateKey, product.projectId, product.id]
  );
}

async function rebuildLegacyMirror(query, appStateKey) {
  const state = await loadNormalizedState(query, appStateKey)
    || await loadLegacyState(query, appStateKey)
    || { projects: [], products: [], jobs: [] };
  const result = await saveLegacyState(query, appStateKey, state);
  return result.rows[0]?.updated_at || "";
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

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function toJson(value) {
  return JSON.stringify(value);
}
