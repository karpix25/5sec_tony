import { hasWriteConflict, lockCurrentUpdatedAt } from "./app-state-concurrency.mjs";
import { defaultAppStateKey, withAppStateRetry } from "./app-state-lock.mjs";
import { getStateTransportMeta, prepareStateForTransport, shouldUseFullStateTransport } from "./state-transport.mjs";

export async function writeWithAppStateConflictCheck({ body, deps, appStateKey, write }) {
  return withAppStateRetry(() => deps.withTransaction(async (tx) => {
    const currentUpdatedAt = await lockCurrentUpdatedAt(tx.query, appStateKey);
    if (hasWriteConflict(currentUpdatedAt, body.baseUpdatedAt)) {
      return {
        conflict: true,
        updatedAt: currentUpdatedAt,
        state: await loadCurrentState(tx.query, deps, appStateKey)
      };
    }
    return write(tx, { currentUpdatedAt });
  }));
}

export function writeWithConflictCheck(body, deps, write, options = {}) {
  return writeWithAppStateConflictCheck({
    body,
    deps,
    appStateKey: options.appStateKey || defaultAppStateKey,
    write
  });
}

export function buildConflictPayload(result, { error, key = defaultAppStateKey, url = null } = {}) {
  if (!url) {
    return {
      saved: false,
      conflict: true,
      error,
      key,
      updatedAt: result.updatedAt,
      state: result.state || null
    };
  }
  const fullTransport = shouldUseFullStateTransport(url);
  const state = prepareStateForTransport(result.state, { full: fullTransport });
  return {
    saved: false,
    conflict: true,
    error,
    key,
    updatedAt: result.updatedAt,
    state,
    transport: getStateTransportMeta(result.state, state, { full: fullTransport })
  };
}

export function sendTransportConflict(response, url, result, error) {
  const fullTransport = shouldUseFullStateTransport(url);
  const state = prepareStateForTransport(result.state, { full: fullTransport });
  return sendJson(response, 409, {
    saved: false,
    conflict: true,
    error,
    key: result.key,
    updatedAt: result.updatedAt,
    state,
    transport: getStateTransportMeta(result.state, state, { full: fullTransport })
  });
}

export async function loadCurrentState(query, deps, key) {
  return await deps.loadNormalized(query, key) || await deps.loadLegacy(query, key);
}

export function readJsonBody(request, { limitBytes = 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    let data = "";
    request.on("data", (chunk) => {
      data += chunk;
      if (data.length > limitBytes) {
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

export function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
  return true;
}

export function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
