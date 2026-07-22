import { loadLegacyState, loadNormalizedState, saveLegacyState } from "./state-relational-store.mjs";

export async function rebuildLegacyMirror(query, appStateKey) {
  const result = await rebuildLegacyMirrorWithState(query, appStateKey);
  return result.updatedAt;
}

export async function rebuildLegacyMirrorWithState(query, appStateKey) {
  const state = await loadNormalizedState(query, appStateKey)
    || await loadLegacyState(query, appStateKey)
    || { projects: [], products: [], jobs: [] };
  const result = await saveLegacyState(query, appStateKey, state);
  return { state, updatedAt: result.rows[0]?.updated_at || "" };
}
