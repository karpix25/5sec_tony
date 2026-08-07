import { fetchJsonWithRetry } from "./sync-fetch.js";

export async function loadRemoteState() {
  const { response, payload } = await fetchJsonWithRetry("/api/state", { method: "GET" });
  readStateSyncPayload(response, payload);
  return {
    state: payload.state || null,
    disabled: Boolean(payload.disabled),
    updatedAt: payload.updatedAt || "",
    refreshUpdatedAt: payload.refreshUpdatedAt || payload.updatedAt || "",
    error: payload.error || ""
  };
}

export async function loadRemoteStateMeta() {
  const { response, payload } = await fetchJsonWithRetry("/api/state/meta", { method: "GET" });
  readStateSyncPayload(response, payload);
  return {
    disabled: Boolean(payload.disabled),
    updatedAt: payload.updatedAt || "",
    refreshUpdatedAt: payload.refreshUpdatedAt || payload.updatedAt || ""
  };
}

export class StateSyncConflictError extends Error {
  constructor(payload = {}) {
    super(payload.error || "State was changed in Postgres by another operator");
    this.name = "StateSyncConflictError";
    this.conflict = true;
    this.state = payload.state || null;
    this.updatedAt = payload.updatedAt || "";
    this.refreshUpdatedAt = payload.refreshUpdatedAt || payload.updatedAt || "";
  }
}

export async function saveRemoteState(state, baseUpdatedAt = "") {
  const { response, payload } = await fetchJsonWithRetry("/api/state", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state, baseUpdatedAt })
  });
  readStateSyncPayload(response, payload);
  return {
    saved: Boolean(payload.saved),
    disabled: Boolean(payload.disabled),
    updatedAt: payload.updatedAt || "",
    refreshUpdatedAt: payload.refreshUpdatedAt || payload.updatedAt || "",
    parityOk: payload.parityOk !== false,
    error: payload.error || ""
  };
}

function readStateSyncPayload(response, payload = {}) {
  if (response.status === 409 || payload.conflict) {
    throw new StateSyncConflictError(payload);
  }
  if (!response.ok) throw new Error(payload.error || "State sync request failed");
}
