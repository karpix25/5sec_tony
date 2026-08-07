export async function touchAppStateMetadata(query, key) {
  const result = await query(
    "update app_state set updated_at = now() where id = $1 returning updated_at",
    [key]
  );
  if (result.rows[0]) return result;
  return query(
    `insert into app_state (id, data, updated_at)
     values ($1, '{}'::jsonb, now())
     on conflict (id) do update set updated_at = now()
     returning updated_at`,
    [key]
  );
}

export async function loadAppStateMetadata(query, key) {
  const result = await query(
    `select greatest(
       (select updated_at from app_state where id = $1 limit 1),
       (select max(updated_at) from studio_projects where app_state_key = $1),
       (select max(updated_at) from studio_products where app_state_key = $1),
       (select max(updated_at) from studio_jobs where app_state_key = $1)
     ) as updated_at,
     greatest(
       (select updated_at from app_state where id = $1 limit 1),
       (select max(updated_at) from studio_projects where app_state_key = $1),
       (select max(updated_at) from studio_products where app_state_key = $1)
     ) as refresh_updated_at`,
    [key]
  );
  const row = result.rows[0] || {};
  return {
    updatedAt: row.updated_at || null,
    refreshUpdatedAt: row.refresh_updated_at || row.updated_at || null
  };
}

export async function loadAppStateUpdatedAt(query, key) {
  return (await loadAppStateMetadata(query, key)).updatedAt;
}
