import { fetchJsonWithRetry } from "./sync-fetch.js";

export async function loadRemoteState() {
  const { response, payload } = await fetchJsonWithRetry("/api/state", {
    method: "GET",
    headers: { "X-State-View": "bootstrap" }
  });
  readStateSyncPayload(response, payload);
  return {
    state: payload.state || null,
    disabled: Boolean(payload.disabled),
    updatedAt: payload.updatedAt || "",
    refreshUpdatedAt: payload.refreshUpdatedAt || payload.updatedAt || "",
    catalogUpdatedAt: payload.catalogUpdatedAt || payload.refreshUpdatedAt || payload.updatedAt || "",
    jobsDeferred: Boolean(payload.jobsDeferred),
    error: payload.error || ""
  };
}

export async function loadRemoteJobsPage(offset = 0, limit = 500, filters = {}) {
  const query = new URLSearchParams({ offset: String(offset), limit: String(limit) });
  if (filters.projectId) query.set("projectId", filters.projectId);
  if (filters.productId) query.set("productId", filters.productId);
  const { response, payload } = await fetchJsonWithRetry(`/api/state/jobs?${query}`, { method: "GET" });
  readStateSyncPayload(response, payload);
  return {
    jobs: Array.isArray(payload.jobs) ? payload.jobs : [],
    nextOffset: Number(payload.nextOffset || 0),
    hasMore: Boolean(payload.hasMore),
    total: Number(payload.total || 0),
    disabled: Boolean(payload.disabled)
  };
}

export async function loadRemoteStateMeta() {
  const { response, payload } = await fetchJsonWithRetry("/api/state/meta", { method: "GET" });
  readStateSyncPayload(response, payload);
  return {
    disabled: Boolean(payload.disabled),
    updatedAt: payload.updatedAt || "",
    refreshUpdatedAt: payload.refreshUpdatedAt || payload.updatedAt || "",
    catalogUpdatedAt: payload.catalogUpdatedAt || payload.refreshUpdatedAt || payload.updatedAt || ""
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
    this.catalogUpdatedAt = payload.catalogUpdatedAt || payload.refreshUpdatedAt || payload.updatedAt || "";
  }
}

export async function saveRemoteState(state, baseUpdatedAt = "") {
  const { response, payload } = await fetchJsonWithRetry("/api/state", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state, baseUpdatedAt }),
    timeoutMs: 60000,
    attempts: 1
  });
  readStateSyncPayload(response, payload);
  return {
    saved: Boolean(payload.saved),
    disabled: Boolean(payload.disabled),
    updatedAt: payload.updatedAt || "",
    refreshUpdatedAt: payload.refreshUpdatedAt || payload.updatedAt || "",
    catalogUpdatedAt: payload.catalogUpdatedAt || payload.refreshUpdatedAt || payload.updatedAt || "",
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
