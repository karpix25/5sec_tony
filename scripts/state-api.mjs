import { isPostgresConfigured, queryPostgres, withPostgresTransaction } from "./postgres-client.mjs";
import { compactJobExtraDropKeys, loadLegacyState, loadNormalizedState, saveLegacyState, saveNormalizedState } from "./state-relational-store.mjs";
import { getStateDifference, statesEqual } from "./state-compare.mjs";
import { hasAudioLibraryChanged, markAudioLibraryUpdated } from "./audio-refresh-reminders.mjs";
import { normalizeStateJobIds } from "../src/domain/job-identity.js";
import { defaultAppStateKey } from "./app-state-lock.mjs";
import {
  loadCurrentState,
  readJsonBody,
  sendJson,
  writeWithConflictCheck
} from "./app-state-api-helpers.mjs";
import { getStateTransportMeta, prepareStateForTransport, shouldUseFullStateTransport } from "./state-transport.mjs";
import {
  loadAppStateMetadata as loadAppStateMetadataDefault,
  touchAppStateMetadata as touchAppStateMetadataDefault
} from "./app-state-metadata.mjs";

const appStateKey = defaultAppStateKey;

export const handleStateApi = createStateApiHandler();

export function createStateApiHandler(deps = {}) {
  const isConfigured = deps.isPostgresConfigured || isPostgresConfigured;
  const query = deps.queryPostgres || queryPostgres;
  const withTransaction = deps.withPostgresTransaction || withPostgresTransaction;
  const loadNormalized = deps.loadNormalizedState || loadNormalizedState;
  const loadLegacy = deps.loadLegacyState || loadLegacyState;
  const saveNormalized = deps.saveNormalizedState || saveNormalizedState;
  const saveLegacy = deps.saveLegacyState || saveLegacyState;
  const touchAppStateMetadata = deps.touchAppStateMetadata || touchAppStateMetadataDefault;
  const loadAppStateMetadata = deps.loadAppStateMetadata || loadAppStateMetadataDefault;
  const markAudioUpdated = deps.markAudioLibraryUpdated || markAudioLibraryUpdated;

  return async function handleStateApi(request, response, url) {
    if (request.method === "GET" && url.pathname === "/api/state/meta") {
      return handleLoadStateMeta(response, { isConfigured, query, loadAppStateMetadata });
    }
    if (request.method === "GET" && url.pathname === "/api/state") {
      return handleLoadState(response, url, { isConfigured, query, withTransaction, loadNormalized, loadLegacy, saveNormalized, saveLegacy, loadAppStateMetadata });
    }
    if (request.method === "POST" && url.pathname === "/api/state") {
      return handleSaveState(request, response, url, { isConfigured, query, withTransaction, loadNormalized, loadLegacy, saveLegacy, saveNormalized, touchAppStateMetadata, markAudioUpdated });
    }
    return false;
  };
}

async function handleLoadStateMeta(response, deps) {
  if (!deps.isConfigured()) {
    return sendJson(response, 200, { key: appStateKey, updatedAt: null, disabled: true });
  }
  try {
    const metadata = await deps.loadAppStateMetadata(deps.query, appStateKey);
    return sendJson(response, 200, { key: appStateKey, ...metadata });
  } catch (error) {
    return sendJson(response, 500, { error: error.message || "Не удалось загрузить метаданные состояния" });
  }
}

async function handleLoadState(response, url, deps) {
  if (!deps.isConfigured()) {
    return sendJson(response, 200, { state: null, disabled: true, reason: "postgres_not_configured" });
  }
  try {
    const fullTransport = shouldUseFullStateTransport(url);
    let state = await deps.loadNormalized(deps.query, appStateKey, { compactJobs: !fullTransport });
    let source = "relational";
    if (!state) {
      state = await deps.loadLegacy(deps.query, appStateKey);
      source = state ? "legacy" : "empty";
      if (state) {
        state = await deps.withTransaction(async (tx) => {
          const nextState = normalizeStateJobIds(state);
          await deps.saveNormalized(tx.query, appStateKey, nextState);
          await deps.saveLegacy(tx.query, appStateKey, nextState);
          const rebuiltState = await deps.loadNormalized(tx.query, appStateKey);
          if (!statesEqual(rebuiltState, nextState)) {
            throw new Error(formatParityError("Legacy migration parity check failed", rebuiltState, nextState));
          }
          return rebuiltState;
        });
      }
    }
    const metadata = await deps.loadAppStateMetadata(deps.query, appStateKey);
    const transportState = prepareStateForTransport(state, { full: fullTransport });
    return sendJson(response, 200, {
      state: transportState || null,
      key: appStateKey,
      source,
      ...metadata,
      transport: getStateTransportMeta(state, transportState, { full: fullTransport })
    });
  } catch (error) {
    return sendJson(response, 500, { error: error.message || "Не удалось загрузить состояние из Postgres" });
  }
}

async function handleSaveState(request, response, url, deps) {
  if (!deps.isConfigured()) {
    return sendJson(response, 200, { saved: false, disabled: true, reason: "postgres_not_configured" });
  }
  try {
    const body = await readJsonBody(request, { limitBytes: 20 * 1024 * 1024 });
    if (!isPlainStateObject(body.state)) {
      return sendJson(response, 400, { error: "state object is required" });
    }
    const result = await writeWithConflictCheck(body, deps, async (tx, { currentUpdatedAt }) => {
      const nextState = normalizeStateJobIds(body.state);
      const currentState = await loadCurrentState(tx.query, deps, appStateKey, { compactJobs: true });
      const projectDeletionConflict = getUnexpectedProjectDeletionConflict(currentState, nextState);
      if (projectDeletionConflict) {
        return {
          conflict: true,
          updatedAt: currentUpdatedAt,
          state: currentState,
          error: projectDeletionConflict
        };
      }
      const productDeletionConflict = getUnexpectedProductDeletionConflict(currentState, nextState);
      if (productDeletionConflict) {
        return {
          conflict: true,
          updatedAt: currentUpdatedAt,
          state: currentState,
          error: productDeletionConflict
        };
      }
      const audioLibraryChanged = hasAudioLibraryChanged(currentState, nextState);
      const normalizedResult = await deps.saveNormalized(tx.query, appStateKey, nextState, { preserveCatalog: true });
      const savedState = isPlainStateObject(normalizedResult) ? normalizedResult : nextState;
      const metadataResult = await deps.touchAppStateMetadata(tx.query, appStateKey);
      if (audioLibraryChanged) await deps.markAudioUpdated({ query: tx.query, appStateKey });
      const rebuiltState = await deps.loadNormalized(tx.query, appStateKey, { compactJobs: true });
      if (!statesEqual(compactStateForParity(rebuiltState), compactStateForParity(savedState))) {
        throw new Error(formatParityError("Relational state parity check failed", rebuiltState, savedState));
      }
      return {
        updatedAt: metadataResult.rows[0]?.updated_at || null,
        parityOk: true
      };
    });
    if (result.conflict) {
      const fullTransport = shouldUseFullStateTransport(url);
      const transportState = prepareStateForTransport(result.state, { full: fullTransport });
      return sendJson(response, 409, {
        saved: false,
        conflict: true,
        error: result.error || "State was changed in Postgres by another operator",
        key: appStateKey,
        updatedAt: result.updatedAt,
        state: transportState || null,
        transport: getStateTransportMeta(result.state, transportState, { full: fullTransport })
      });
    }
    return sendJson(response, 200, { saved: true, key: appStateKey, updatedAt: result.updatedAt, parityOk: result.parityOk });
  } catch (error) {
    return sendJson(response, 500, { error: error.message || "Не удалось сохранить состояние в Postgres" });
  }
}

function compactStateForParity(state) {
  if (!state || !Array.isArray(state.jobs)) return state;
  return {
    ...state,
    jobs: state.jobs.map((job) => {
      const compactJob = { ...job };
      for (const key of compactJobExtraDropKeys) delete compactJob[key];
      compactJob.prompt = "";
      return compactJob;
    }),
  };
}

function isPlainStateObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function formatParityError(message, rebuiltState, nextState) {
  const diff = getStateDifference(rebuiltState, nextState);
  if (!diff) return message;
  return `${message}: ${diff.path}`;
}

function getUnexpectedProductDeletionConflict(currentState, nextState) {
  const currentProducts = Array.isArray(currentState?.products) ? currentState.products : [];
  if (!currentProducts.length) return "";
  const nextProductIds = new Set((Array.isArray(nextState?.products) ? nextState.products : []).map((product) => product.id));
  const deletedProductIds = new Set(Array.isArray(nextState?.deletedProductIds) ? nextState.deletedProductIds : []);
  const missing = currentProducts.filter((product) => product?.id && !nextProductIds.has(product.id) && !deletedProductIds.has(product.id));
  return missing.length
    ? `Product deletion requires explicit delete action: ${missing.map((product) => product.name || product.id).join(", ")}`
    : "";
}

function getUnexpectedProjectDeletionConflict(currentState, nextState) {
  const currentProjects = Array.isArray(currentState?.projects) ? currentState.projects : [];
  if (!currentProjects.length) return "";
  const nextProjectIds = new Set((Array.isArray(nextState?.projects) ? nextState.projects : []).map((project) => project.id));
  const deletedProjectIds = new Set(Array.isArray(nextState?.deletedProjectIds) ? nextState.deletedProjectIds : []);
  const missing = currentProjects.filter((project) => project?.id && !nextProjectIds.has(project.id) && !deletedProjectIds.has(project.id));
  return missing.length
    ? `Project deletion requires explicit delete action: ${missing.map((project) => project.name || project.id).join(", ")}`
    : "";
}
