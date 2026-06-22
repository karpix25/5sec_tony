import { isPostgresConfigured, withPostgresTransaction } from "./postgres-client.mjs";
import { loadLegacyState, loadNormalizedState, saveLegacyState, saveNormalizedState } from "./state-relational-store.mjs";

const appStateKey = process.env.APP_STATE_KEY || "default";

export async function persistServerJobSnapshot(job, deps = {}) {
  if (!job?.id || !(deps.isPostgresConfigured || isPostgresConfigured)()) return false;
  const withTransaction = deps.withPostgresTransaction || withPostgresTransaction;
  return withTransaction(async (tx) => {
    const state = await loadCurrentState(tx.query, deps);
    if (!state?.jobs?.length) return false;
    const index = state.jobs.findIndex((item) => item.id === job.id);
    if (index < 0) return false;
    const jobs = state.jobs.slice();
    jobs[index] = { ...jobs[index], ...job };
    const nextState = { ...state, jobs };
    await saveNormalizedState(tx.query, appStateKey, nextState);
    await saveLegacyState(tx.query, appStateKey, nextState);
    return true;
  });
}

export async function loadPersistedServerJob(jobId, deps = {}) {
  if (!jobId || !(deps.isPostgresConfigured || isPostgresConfigured)()) return null;
  const withTransaction = deps.withPostgresTransaction || withPostgresTransaction;
  return withTransaction(async (tx) => {
    const state = await loadCurrentState(tx.query, deps);
    return state?.jobs?.find((job) => job.id === jobId) || null;
  });
}

async function loadCurrentState(query, deps) {
  const loadNormalized = deps.loadNormalizedState || loadNormalizedState;
  const loadLegacy = deps.loadLegacyState || loadLegacyState;
  return await loadNormalized(query, appStateKey) || await loadLegacy(query, appStateKey);
}
