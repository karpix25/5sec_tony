export async function lockAppStateMutation(query, appStateKey) {
  await query(
    "select pg_advisory_xact_lock(hashtext($1), hashtext($2))",
    ["anton-5sec:app-state", appStateKey || "default"]
  );
}
