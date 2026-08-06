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
