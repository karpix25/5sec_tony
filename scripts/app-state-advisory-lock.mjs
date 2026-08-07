export async function lockAppStateMutation(query, appStateKey, scope = "") {
  // ponytail: one global job lock favors correctness; shard only after measured worker contention.
  await query(
    "select pg_advisory_xact_lock(hashtext($1), hashtext($2))",
    ["anton-5sec:app-state", `${appStateKey}:jobs`]
  );
  if (scope) {
    await query(
      "select pg_advisory_xact_lock(hashtext($1), hashtext($2))",
      ["anton-5sec:app-state", `${appStateKey}:project:${scope}`]
    );
  }
}
