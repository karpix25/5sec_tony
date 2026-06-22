import { isPostgresConfigured, queryPostgres, withPostgresTransaction } from "./postgres-client.mjs";
import { loadLegacyState, loadNormalizedState, saveLegacyState, saveNormalizedState } from "./state-relational-store.mjs";

const appStateKey = process.env.APP_STATE_KEY || "default";

export const handleStateApi = createStateApiHandler();

export function createStateApiHandler(deps = {}) {
  const isConfigured = deps.isPostgresConfigured || isPostgresConfigured;
  const query = deps.queryPostgres || queryPostgres;
  const withTransaction = deps.withPostgresTransaction || withPostgresTransaction;
  const loadNormalized = deps.loadNormalizedState || loadNormalizedState;
  const loadLegacy = deps.loadLegacyState || loadLegacyState;
  const saveNormalized = deps.saveNormalizedState || saveNormalizedState;
  const saveLegacy = deps.saveLegacyState || saveLegacyState;

  return async function handleStateApi(request, response, url) {
    if (request.method === "GET" && url.pathname === "/api/state") {
      return handleLoadState(response, { isConfigured, query, withTransaction, loadNormalized, loadLegacy, saveNormalized, saveLegacy });
    }
    if (request.method === "POST" && url.pathname === "/api/state") {
      return handleSaveState(request, response, { isConfigured, query, withTransaction, loadNormalized, saveLegacy, saveNormalized });
    }
    return false;
  };
}

async function handleLoadState(response, deps) {
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
          await deps.saveNormalized(tx.query, appStateKey, state);
          await deps.saveLegacy(tx.query, appStateKey, state);
          const rebuiltState = await deps.loadNormalized(tx.query, appStateKey);
          if (!statesEqual(rebuiltState, state)) {
            throw new Error("Legacy migration parity check failed");
          }
          return rebuiltState;
        });
      }
    }
    const meta = await deps.query("select updated_at from app_state where id = $1 limit 1", [appStateKey]);
    return sendJson(response, 200, {
      state: state || null,
      key: appStateKey,
      source,
      updatedAt: meta.rows[0]?.updated_at || null
    });
  } catch (error) {
    return sendJson(response, 500, { error: error.message || "Не удалось загрузить состояние из Postgres" });
  }
}

async function handleSaveState(request, response, deps) {
  if (!deps.isConfigured()) {
    return sendJson(response, 200, { saved: false, disabled: true, reason: "postgres_not_configured" });
  }
  try {
    const body = await readJsonBody(request);
    if (!isPlainStateObject(body.state)) {
      return sendJson(response, 400, { error: "state object is required" });
    }
    const result = await deps.withTransaction(async (tx) => {
      await deps.saveNormalized(tx.query, appStateKey, body.state);
      const legacyResult = await deps.saveLegacy(tx.query, appStateKey, body.state);
      const rebuiltState = await deps.loadNormalized(tx.query, appStateKey);
      if (!statesEqual(rebuiltState, body.state)) {
        throw new Error("Relational state parity check failed");
      }
      return {
        updatedAt: legacyResult.rows[0]?.updated_at || null,
        parityOk: true
      };
    });
    return sendJson(response, 200, { saved: true, key: appStateKey, updatedAt: result.updatedAt, parityOk: result.parityOk });
  } catch (error) {
    return sendJson(response, 500, { error: error.message || "Не удалось сохранить состояние в Postgres" });
  }
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let data = "";
    request.on("data", (chunk) => {
      data += chunk;
      if (data.length > 20 * 1024 * 1024) {
        reject(new Error("Request body is too large"));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
  return true;
}

function isPlainStateObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function statesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
