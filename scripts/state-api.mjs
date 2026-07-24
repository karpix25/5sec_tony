import { isPostgresConfigured, queryPostgres, withPostgresTransaction } from "./postgres-client.mjs";
import { loadLegacyState, loadNormalizedState, saveLegacyState, saveNormalizedState } from "./state-relational-store.mjs";
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
  const markAudioUpdated = deps.markAudioLibraryUpdated || markAudioLibraryUpdated;

  return async function handleStateApi(request, response, url) {
    if (request.method === "GET" && url.pathname === "/api/state") {
      return handleLoadState(response, url, { isConfigured, query, withTransaction, loadNormalized, loadLegacy, saveNormalized, saveLegacy });
    }
    if (request.method === "POST" && url.pathname === "/api/state") {
      return handleSaveState(request, response, url, { isConfigured, query, withTransaction, loadNormalized, loadLegacy, saveLegacy, saveNormalized, markAudioUpdated });
    }
    return false;
  };
}

async function handleLoadState(response, url, deps) {
  if (!deps.isConfigured()) {
    return sendJson(response, 200, { state: null, disabled: true, reason: "postgres_not_configured" });
  }
  try {
    let state = await deps.loadNormalized(deps.query, appStateKey);
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
    const meta = await deps.query("select updated_at from app_state where id = $1 limit 1", [appStateKey]);
    const fullTransport = shouldUseFullStateTransport(url);
    const transportState = prepareStateForTransport(state, { full: fullTransport });
    return sendJson(response, 200, {
      state: transportState || null,
      key: appStateKey,
      source,
      updatedAt: meta.rows[0]?.updated_at || null,
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
      const currentState = await loadCurrentState(tx.query, deps, appStateKey);
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
      const normalizedResult = await deps.saveNormalized(tx.query, appStateKey, nextState);
      const savedState = isPlainStateObject(normalizedResult) ? normalizedResult : nextState;
      const legacyResult = await deps.saveLegacy(tx.query, appStateKey, savedState);
      if (audioLibraryChanged) await deps.markAudioUpdated({ query: tx.query, appStateKey });
      const rebuiltState = await deps.loadNormalized(tx.query, appStateKey);
      if (!statesEqual(rebuiltState, savedState)) {
        throw new Error(formatParityError("Relational state parity check failed", rebuiltState, savedState));
      }
      return {
        updatedAt: legacyResult.rows[0]?.updated_at || null,
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
