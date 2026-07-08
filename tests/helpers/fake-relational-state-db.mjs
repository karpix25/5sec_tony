const jsonColumns = new Set([
  "generation_brief",
  "extra",
  "automation",
  "cta_overlay",
  "references",
  "audio_library",
  "avatar_candidates",
  "design_reference_candidates",
  "characters",
  "pains",
  "facts",
  "forbidden",
  "ai_passport",
  "input_urls",
  "input_refs",
  "diversity_slot",
  "queue_metadata",
  "tags",
  "accounts",
  "errors",
  "videos",
  "summary"
]);

const listTableNames = [
  "studio_projects",
  "studio_products",
  "studio_jobs",
  "studio_global_audio_assets",
  "studio_hook_versions",
  "studio_hook_items"
];

export function createFakeRelationalStateDb(options = {}) {
  const db = {
    appState: new Map(),
    uiState: new Map(),
    hookState: new Map(),
    reelsResearch: new Map(),
    lists: Object.fromEntries(listTableNames.map((table) => [table, []]))
  };
  let updatedAt = options.updatedAt || "2026-06-16T10:06:00.000Z";

  async function query(text, params = []) {
    if (isSchemaQuery(text) || /select pg_advisory_xact_lock/i.test(text)) return { rows: [] };
    if (/select updated_at from app_state/i.test(text)) return selectAppStateUpdatedAt(db, params[0]);
    if (/insert into app_state/i.test(text)) return insertAppState(db, params, updatedAt);
    if (/exists\(select 1 from studio_app_ui_state/i.test(text)) return selectNormalizedPresence(db, params[0]);

    const deleteMatch = text.match(/delete from\s+(studio_\w+)/i);
    if (deleteMatch) {
      deleteStudioRows(db, deleteMatch[1], params[0]);
      return { rows: [] };
    }

    const insertMatch = text.match(/insert into\s+(studio_\w+)/i);
    if (insertMatch) {
      insertStudioRow(db, insertMatch[1], mapInsertRow(text, params, insertMatch[1]), updatedAt);
      return { rows: [] };
    }

    const selectMatch = text.match(/select \* from\s+(studio_\w+)/i);
    if (selectMatch) return selectStudioRows(db, selectMatch[1], params[0]);

    throw new Error(`Unexpected query: ${text.trim()}`);
  }

  return {
    query,
    setUpdatedAt(value) {
      updatedAt = value;
    }
  };
}

function isSchemaQuery(text) {
  return /create table if not exists/i.test(text)
    || /alter table .* add column if not exists/i.test(text)
    || /create (unique )?index if not exists/i.test(text);
}

function selectAppStateUpdatedAt(db, key) {
  const row = db.appState.get(key);
  return { rows: row ? [{ updated_at: row.updated_at }] : [] };
}

function insertAppState(db, params, updatedAt) {
  db.appState.set(params[0], {
    data: parseJson(params[1]),
    updated_at: updatedAt
  });
  return { rows: [{ updated_at: updatedAt }] };
}

function selectNormalizedPresence(db, key) {
  const present = db.uiState.has(key)
    || db.hookState.has(key)
    || db.reelsResearch.has(key)
    || Object.values(db.lists).some((rows) => rows.some((row) => row.app_state_key === key));
  return { rows: [{ present }] };
}

function insertStudioRow(db, table, row, updatedAt) {
  const nextRow = { ...row, updated_at: updatedAt, touched_at: updatedAt };
  if (table === "studio_app_ui_state") {
    db.uiState.set(nextRow.app_state_key, nextRow);
    return;
  }
  if (table === "studio_hook_library_state") {
    db.hookState.set(nextRow.app_state_key, nextRow);
    return;
  }
  if (table === "studio_reels_research") {
    db.reelsResearch.set(nextRow.app_state_key, nextRow);
    return;
  }
  db.lists[table].push(nextRow);
}

function deleteStudioRows(db, table, key) {
  if (table === "studio_app_ui_state") {
    db.uiState.delete(key);
    return;
  }
  if (table === "studio_hook_library_state") {
    db.hookState.delete(key);
    return;
  }
  if (table === "studio_reels_research") {
    db.reelsResearch.delete(key);
    return;
  }
  db.lists[table] = db.lists[table].filter((row) => row.app_state_key !== key);
}

function selectStudioRows(db, table, key) {
  if (table === "studio_app_ui_state") return singleRow(db.uiState.get(key));
  if (table === "studio_hook_library_state") return singleRow(db.hookState.get(key));
  if (table === "studio_reels_research") return singleRow(db.reelsResearch.get(key));
  return {
    rows: db.lists[table]
      .filter((row) => row.app_state_key === key)
      .sort((left, right) => Number(left.sort_order || 0) - Number(right.sort_order || 0))
  };
}

function singleRow(row) {
  return { rows: row ? [row] : [] };
}

function mapInsertRow(text, params, table) {
  const columns = extractInsertColumns(text, table);
  return columns.reduce((row, column, index) => {
    if (index < params.length) row[column] = parseColumnValue(column, params[index]);
    return row;
  }, {});
}

function extractInsertColumns(text, table) {
  const match = text.match(new RegExp(`insert\\s+into\\s+${table}\\s*\\(([\\s\\S]*?)\\)\\s*values`, "i"));
  if (!match) throw new Error(`Could not parse insert columns for ${table}`);
  return match[1].split(",").map((column) => column.trim().replace(/^"|"$/g, ""));
}

function parseColumnValue(column, value) {
  return jsonColumns.has(column) ? parseJson(value) : value;
}

function parseJson(value) {
  if (typeof value !== "string") return value;
  return JSON.parse(value);
}
