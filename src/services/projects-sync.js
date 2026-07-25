import { StateSyncConflictError } from "./state-sync.js";
import { fetchJsonWithRetry } from "./sync-fetch.js";

export async function createRemoteProject(bundle, baseUpdatedAt = "") {
  return saveRemoteProject("/api/projects", "POST", bundle, baseUpdatedAt);
}

export async function updateRemoteProject(projectId, project, baseUpdatedAt = "", metadata = {}) {
  return saveRemoteProject(`/api/projects/${encodeURIComponent(projectId)}`, "PATCH", { project, ...metadata }, baseUpdatedAt);
}

export async function updateRemoteProjectResource(projectId, resourceName, payload, baseUpdatedAt = "") {
  return saveRemoteProject(
    `/api/projects/${encodeURIComponent(projectId)}/${encodeURIComponent(resourceName)}`,
    "PATCH",
    { payload },
    baseUpdatedAt
  );
}

export async function deleteRemoteProject(projectId, baseUpdatedAt = "") {
  const body = JSON.stringify({ baseUpdatedAt });
  const { response, payload } = await fetchJsonWithRetry(`/api/projects/${encodeURIComponent(projectId)}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true
  });
  readProjectSyncPayload(response, payload);
  return readProjectResult(payload);
}

async function saveRemoteProject(url, method, bodyPayload, baseUpdatedAt) {
  const body = JSON.stringify({ ...bodyPayload, baseUpdatedAt });
  const { response, payload } = await fetchJsonWithRetry(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: body.length < 60 * 1024
  });
  readProjectSyncPayload(response, payload);
  return readProjectResult(payload);
}

function readProjectSyncPayload(response, payload = {}) {
  if (response.status === 409 || payload.conflict) {
    throw new StateSyncConflictError(payload);
  }
  if (!response.ok) throw new Error(payload.error || "Project sync request failed");
}

function readProjectResult(payload = {}) {
  return {
    saved: Boolean(payload.saved),
    disabled: Boolean(payload.disabled),
    project: payload.project || null,
    product: payload.product || null,
    deletedProjectId: payload.deletedProjectId || "",
    updatedAt: payload.updatedAt || "",
    error: payload.error || ""
  };
}
