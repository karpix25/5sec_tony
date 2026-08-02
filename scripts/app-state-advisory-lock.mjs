export async function lockAppStateMutation(query, appStateKey, scope = "") {
  const lockScope = scope ? `${appStateKey}:project:${scope}` : appStateKey;
  await query(
    "select pg_advisory_xact_lock(hashtext($1), hashtext($2))",
    ["anton-5sec:app-state", lockScope || "default"]
  );
}
