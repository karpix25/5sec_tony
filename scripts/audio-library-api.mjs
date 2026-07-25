import { defaultAppStateKey } from "./app-state-lock.mjs";
import {
  buildConflictPayload,
  readJsonBody,
  sendJson,
  writeWithConflictCheck
} from "./app-state-api-helpers.mjs";
import { appendAudioAssetToState, deleteAudioAssetFromState } from "./media-state-store.mjs";
import { isPostgresConfigured, withPostgresTransaction } from "./postgres-client.mjs";
import { loadLegacyState, loadNormalizedState } from "./state-relational-store.mjs";

const appStateKey = defaultAppStateKey;
const audioJsonBodyLimitBytes = 12 * 1024 * 1024;

export const handleAudioLibraryApi = createAudioLibraryApiHandler();

export function createAudioLibraryApiHandler(deps = {}) {
  const isConfigured = deps.isPostgresConfigured || isPostgresConfigured;
  const withTransaction = deps.withPostgresTransaction || withPostgresTransaction;
  const appendAudio = deps.appendAudioAssetToState || appendAudioAssetToState;
  const deleteAudio = deps.deleteAudioAssetFromState || deleteAudioAssetFromState;
  const loadNormalized = deps.loadNormalizedState || loadNormalizedState;
  const loadLegacy = deps.loadLegacyState || loadLegacyState;

  return async function handleAudioLibraryApi(request, response, url) {
    if (request.method === "POST" && url.pathname === "/api/audio-library") {
      return handleAppendAudio(request, response, url, { isConfigured, withTransaction, appendAudio, loadNormalized, loadLegacy });
    }
    const audioId = getAudioId(url.pathname);
    if (request.method === "DELETE" && audioId) {
      return handleDeleteAudio(request, response, url, { isConfigured, withTransaction, deleteAudio, loadNormalized, loadLegacy, audioId });
    }
    return false;
  };
}

async function handleAppendAudio(request, response, url, deps) {
  if (!deps.isConfigured()) return sendDisabled(response);
  try {
    const body = await readJsonBody(request, { limitBytes: audioJsonBodyLimitBytes });
    const assets = getAudioAssets(body);
    if (!assets.length) return sendJson(response, 400, { error: "audio asset is required" });
    const result = await writeWithConflictCheck(body, deps, async (tx) => {
      const saved = [];
      let updatedAt = "";
      for (const asset of assets) {
        const item = await deps.appendAudio(asset, { query: tx.query, appStateKey, isPostgresConfigured: deps.isConfigured });
        saved.push(item);
        updatedAt = item.updatedAt || updatedAt;
      }
      return { assets: saved, selectedAudioId: saved[0]?.id || "", updatedAt };
    });
    if (result.conflict) return sendConflict(response, url, result, "повторите загрузку аудио");
    return sendJson(response, 200, {
      saved: true,
      key: appStateKey,
      assets: result.assets || [],
      selectedAudioId: result.selectedAudioId || "",
      updatedAt: result.updatedAt || ""
    });
  } catch (error) {
    return sendJson(response, 500, { error: error.message || "Не удалось сохранить аудио" });
  }
}

async function handleDeleteAudio(request, response, url, deps) {
  if (!deps.isConfigured()) return sendDisabled(response);
  try {
    const body = await readJsonBody(request, { limitBytes: audioJsonBodyLimitBytes });
    const result = await writeWithConflictCheck(body, deps, (tx) =>
      deps.deleteAudio(deps.audioId, {
        query: tx.query,
        appStateKey,
        selectedAudioId: body.selectedAudioId || "",
        isPostgresConfigured: deps.isConfigured
      })
    );
    if (result.conflict) return sendConflict(response, url, result, "повторите удаление аудио");
    return sendJson(response, 200, {
      saved: true,
      key: appStateKey,
      deletedAudioId: result.deletedAudioId || "",
      selectedAudioId: result.selectedAudioId || "",
      audioLibrary: result.audioLibrary || [],
      updatedAt: result.updatedAt || ""
    });
  } catch (error) {
    return sendJson(response, 500, { error: error.message || "Не удалось удалить аудио" });
  }
}

function getAudioAssets(body) {
  if (Array.isArray(body?.assets)) return body.assets.filter(Boolean);
  if (body?.audio) return [body.audio];
  return [];
}

function getAudioId(pathname) {
  const match = pathname.match(/^\/api\/audio-library\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : "";
}

function sendDisabled(response) {
  return sendJson(response, 200, { saved: false, disabled: true, reason: "postgres_not_configured" });
}

function sendConflict(response, url, result, action) {
  return sendJson(response, 409, buildConflictPayload(result, {
    error: `БД обновлена другим оператором. Данные обновлены, ${action}.`,
    key: appStateKey,
    url
  }));
}
