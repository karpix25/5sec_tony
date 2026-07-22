import { StateSyncConflictError } from "./state-sync.js";
import { fetchJsonWithRetry } from "./sync-fetch.js";

export class DesignReferenceEndpointUnavailableError extends Error {
  constructor(status, payload = {}) {
    super(payload.error || "Design reference endpoint is not available");
    this.name = "DesignReferenceEndpointUnavailableError";
    this.endpointUnavailable = true;
    this.status = status;
  }
}

export async function createRemoteDesignReference(projectId, reference, baseUpdatedAt = "") {
  return saveRemoteDesignReference(projectReferenceCollectionUrl(projectId), "POST", { reference }, baseUpdatedAt);
}

export async function updateRemoteDesignReference(projectId, referenceId, patch, baseUpdatedAt = "") {
  return saveRemoteDesignReference(projectReferenceUrl(projectId, referenceId), "PATCH", { patch }, baseUpdatedAt);
}

export async function deleteRemoteDesignReference(projectId, referenceId, baseUpdatedAt = "") {
  return saveRemoteDesignReference(projectReferenceUrl(projectId, referenceId), "DELETE", {}, baseUpdatedAt);
}

export async function approveRemoteDesignReferenceCandidate(projectId, candidateId, baseUpdatedAt = "") {
  return saveRemoteDesignReference(projectCandidateUrl(projectId, candidateId, "/approve"), "POST", {}, baseUpdatedAt);
}

export async function rejectRemoteDesignReferenceCandidate(projectId, candidateId, baseUpdatedAt = "") {
  return saveRemoteDesignReference(projectCandidateUrl(projectId, candidateId, "/reject"), "DELETE", {}, baseUpdatedAt);
}

async function saveRemoteDesignReference(url, method, bodyPayload, baseUpdatedAt) {
  const body = JSON.stringify({ ...bodyPayload, baseUpdatedAt });
  const { response, payload } = await fetchJsonWithRetry(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: body.length < 60 * 1024
  });
  readDesignReferenceSyncPayload(response, payload);
  return readDesignReferenceResult(payload);
}

function readDesignReferenceSyncPayload(response, payload = {}) {
  if (response.status === 409 || payload.conflict) throw new StateSyncConflictError(payload);
  if (response.status === 404 || response.status === 405) {
    throw new DesignReferenceEndpointUnavailableError(response.status, payload);
  }
  if (!response.ok) throw new Error(payload.error || "Design reference sync request failed");
}

function readDesignReferenceResult(payload = {}) {
  return {
    saved: Boolean(payload.saved),
    disabled: Boolean(payload.disabled),
    project: payload.project || null,
    reference: payload.reference || null,
    references: Array.isArray(payload.references) ? payload.references : null,
    candidates: Array.isArray(payload.candidates) ? payload.candidates : null,
    deletedReferenceId: payload.deletedReferenceId || "",
    deletedCandidateId: payload.deletedCandidateId || payload.rejectedCandidateId || "",
    updatedAt: payload.updatedAt || "",
    error: payload.error || ""
  };
}

function projectReferenceCollectionUrl(projectId) {
  return `/api/projects/${encodeURIComponent(projectId)}/design-references`;
}

function projectReferenceUrl(projectId, referenceId) {
  return `${projectReferenceCollectionUrl(projectId)}/${encodeURIComponent(referenceId)}`;
}

function projectCandidateUrl(projectId, candidateId, suffix = "") {
  return `/api/projects/${encodeURIComponent(projectId)}/design-reference-candidates/${encodeURIComponent(candidateId)}${suffix}`;
}
