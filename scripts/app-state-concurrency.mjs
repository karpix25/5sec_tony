import { lockAppState } from "./app-state-lock.mjs";
import { loadAppStateUpdatedAt } from "./app-state-metadata.mjs";

export async function lockCurrentUpdatedAt(query, key, options = {}) {
  await lockAppState(query, key, options.scope || "");
  const lockClause = options.forUpdate === false ? "" : " for update";
  if (lockClause) await query("select updated_at from app_state where id = $1 limit 1 for update", [key]);
  return formatUpdatedAt(await loadAppStateUpdatedAt(query, key));
}

export function hasWriteConflict(currentUpdatedAt, baseUpdatedAt) {
  const current = formatUpdatedAt(currentUpdatedAt);
  const base = formatUpdatedAt(baseUpdatedAt);
  if (!current) return false;
  if (!base) return true;
  return current !== base;
}

export function formatUpdatedAt(value) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}
