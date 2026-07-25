export async function appendUiTombstones(query, appStateKey, tombstones = {}) {
  const patch = buildTombstonePatch(tombstones);
  if (!Object.keys(patch).length) return;
  const existing = await query("select extra from studio_app_ui_state where app_state_key = $1 limit 1", [appStateKey]);
  const extra = asObject(existing.rows[0]?.extra);
  const nextExtra = {
    ...extra,
    ...Object.fromEntries(Object.entries(patch).map(([key, ids]) => [key, appendUnique(asArray(extra[key]), ids)]))
  };
  await query(
    `insert into studio_app_ui_state (app_state_key, extra, updated_at)
     values ($1, $2::jsonb, now())
     on conflict (app_state_key)
     do update set extra = excluded.extra, updated_at = now()`,
    [appStateKey, JSON.stringify(nextExtra)]
  );
}

function buildTombstonePatch(tombstones) {
  return Object.fromEntries(
    Object.entries(tombstones)
      .map(([key, value]) => [key, asArray(value).filter(Boolean)])
      .filter(([, ids]) => ids.length)
  );
}

function appendUnique(current, next) {
  return [...new Set([...current, ...next])];
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
