import { lockAppState } from "./app-state-lock.mjs";

export async function lockCurrentUpdatedAt(query, key) {
  await lockAppState(query, key);
  const result = await query("select updated_at from app_state where id = $1 limit 1 for update", [key]);
  return formatUpdatedAt(result.rows[0]?.updated_at || "");
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
