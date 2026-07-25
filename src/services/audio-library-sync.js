import { StateSyncConflictError } from "./state-sync.js";
import { fetchJsonWithRetry } from "./sync-fetch.js";

export async function createRemoteAudioAssets(assets, baseUpdatedAt = "") {
  const body = JSON.stringify({ assets, baseUpdatedAt });
  const { response, payload } = await fetchJsonWithRetry("/api/audio-library", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: body.length < 60 * 1024
  });
  readAudioSyncPayload(response, payload);
  return {
    saved: Boolean(payload.saved),
    disabled: Boolean(payload.disabled),
    assets: payload.assets || [],
    selectedAudioId: payload.selectedAudioId || "",
    updatedAt: payload.updatedAt || "",
    error: payload.error || ""
  };
}

export async function deleteRemoteAudioAsset(audioId, selectedAudioId = "", baseUpdatedAt = "") {
  const body = JSON.stringify({ selectedAudioId, baseUpdatedAt });
  const { response, payload } = await fetchJsonWithRetry(`/api/audio-library/${encodeURIComponent(audioId)}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true
  });
  readAudioSyncPayload(response, payload);
  return {
    saved: Boolean(payload.saved),
    disabled: Boolean(payload.disabled),
    deletedAudioId: payload.deletedAudioId || "",
    selectedAudioId: payload.selectedAudioId || "",
    audioLibrary: payload.audioLibrary || [],
    updatedAt: payload.updatedAt || "",
    error: payload.error || ""
  };
}

function readAudioSyncPayload(response, payload = {}) {
  if (response.status === 409 || payload.conflict) throw new StateSyncConflictError(payload);
  if (!response.ok) throw new Error(payload.error || "Audio library sync request failed");
}
