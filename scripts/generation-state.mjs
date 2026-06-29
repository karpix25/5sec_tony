import { isPostgresConfigured, queryPostgres, withPostgresTransaction } from "./postgres-client.mjs";
import { loadLegacyState, loadNormalizedState, saveLegacyState, saveNormalizedState } from "./state-relational-store.mjs";
import { defaultAppStateKey, lockAppState, withAppStateRetry } from "./app-state-lock.mjs";

const appStateKey = defaultAppStateKey;

export async function loadGenerationState(deps = {}) {
  const isConfigured = deps.isPostgresConfigured || isPostgresConfigured;
  if (!isConfigured()) throw new Error("Postgres is not configured");
  const query = deps.queryPostgres || queryPostgres;
  return await loadNormalizedState(query, appStateKey) || await loadLegacyState(query, appStateKey);
}

export async function updateGenerationState(updater, deps = {}) {
  const isConfigured = deps.isPostgresConfigured || isPostgresConfigured;
  if (!isConfigured()) throw new Error("Postgres is not configured");
  const withTransaction = deps.withPostgresTransaction || withPostgresTransaction;
  return withAppStateRetry(() => withTransaction(async (tx) => {
    await lockAppState(tx.query, appStateKey);
    const current = await loadNormalizedState(tx.query, appStateKey) || await loadLegacyState(tx.query, appStateKey);
    if (!current) throw new Error("State is empty");
    const nextState = await updater(current);
    await saveNormalizedState(tx.query, appStateKey, nextState);
    const legacyResult = await saveLegacyState(tx.query, appStateKey, nextState);
    return {
      state: nextState,
      updatedAt: legacyResult.rows[0]?.updated_at || null
    };
  }));
}
