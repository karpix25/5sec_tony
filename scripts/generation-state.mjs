import { isPostgresConfigured, queryPostgres, withPostgresTransaction } from "./postgres-client.mjs";
import { loadLegacyState, loadNormalizedState, saveNormalizedState } from "./state-relational-store.mjs";
import { defaultAppStateKey, lockAppState, withAppStateRetry } from "./app-state-lock.mjs";
import { persistAutomationStateDelta } from "./automation/relational-state-store.mjs";

const appStateKey = defaultAppStateKey;

export async function loadGenerationState(deps = {}, options = {}) {
  const isConfigured = deps.isPostgresConfigured || isPostgresConfigured;
  if (!isConfigured()) throw new Error("Postgres is not configured");
  const query = deps.queryPostgres || queryPostgres;
  return await loadNormalizedState(query, appStateKey, options) || await loadLegacyState(query, appStateKey);
}

export async function updateGenerationState(updater, deps = {}) {
  const isConfigured = deps.isPostgresConfigured || isPostgresConfigured;
  if (!isConfigured()) throw new Error("Postgres is not configured");
  const withTransaction = deps.withPostgresTransaction || withPostgresTransaction;
  if (deps.optimizedPersistence === true) {
    const query = deps.queryPostgres || queryPostgres;
    const current = await loadNormalizedState(query, appStateKey, deps.stateLoadOptions || {}) || await loadLegacyState(query, appStateKey);
    if (!current) throw new Error("State is empty");
    const nextState = await updater(current);
    const persist = deps.persistAutomationStateDelta || persistAutomationStateDelta;
    return persist(current, nextState, {
      ...deps,
      compactJobs: deps.stateLoadOptions?.compactJobs === true
    });
  }
  return withAppStateRetry(() => withTransaction(async (tx) => {
    await lockAppState(tx.query, appStateKey);
    const current = await loadNormalizedState(tx.query, appStateKey) || await loadLegacyState(tx.query, appStateKey);
    if (!current) throw new Error("State is empty");
    const nextState = await updater(current);
    await saveNormalizedState(tx.query, appStateKey, nextState);
    const timestampResult = await tx.query(
      "update app_state set updated_at = now() where id = $1 returning updated_at",
      [appStateKey]
    );
    return {
      state: nextState,
      updatedAt: timestampResult.rows[0]?.updated_at || new Date().toISOString()
    };
  }));
}
