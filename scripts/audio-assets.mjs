import { deleteS3AssetByUrl, isS3AssetStorageConfigured, uploadDataUrlToS3 } from "./s3-assets.mjs";
import { appendAudioAssetToState } from "./media-state-store.mjs";

const audioDataUrlPattern = /^data:(audio\/[^;]+);base64,([a-z0-9+/=\s]+)$/i;
const maxAudioPayloadBytes = 20 * 1024 * 1024;

export async function handleAudioAssetsApi(request, response, url) {
  if (request.method === "POST" && url.pathname === "/api/audio-assets") {
    return saveAudioAsset(request, response);
  }
  if (request.method === "POST" && url.pathname === "/api/audio-assets/delete") {
    return deleteAudioAsset(request, response);
  }
  return false;
}

async function saveAudioAsset(request, response) {
  try {
    if (!isS3AssetStorageConfigured()) {
      return sendJson(response, 503, { error: "S3 storage is not configured" });
    }
    const body = await readJson(request, maxAudioPayloadBytes);
    if (!isAudioDataUrl(body.audioData)) {
      return sendJson(response, 400, { error: "audioData must be an audio/* data URL" });
    }
    const url = await uploadDataUrlToS3(body.audioData, { prefix: "audio" });
    const audio = await appendAudioAssetToState({
      id: body.id || "",
      title: body.title || body.fileName || "",
      fileName: body.fileName || "",
      fileType: getAudioMimeType(body.audioData),
      fileSize: body.fileSize || 0,
      fileData: url,
      createdAt: body.createdAt || ""
    });
    return sendJson(response, 200, {
      audio,
      url,
      fileName: audio.fileName,
      fileType: audio.fileType
    });
  } catch (error) {
    return sendJson(response, 502, { error: error.message || "Не удалось сохранить audio asset" });
  }
}

async function deleteAudioAsset(request, response) {
  try {
    const body = await readJson(request, 1024 * 1024);
    const deleted = await deleteS3AssetByUrl(body.url || body.fileData || "");
    return sendJson(response, 200, { deleted });
  } catch (error) {
    return sendJson(response, 502, { error: error.message || "Не удалось удалить audio asset" });
  }
}

function isAudioDataUrl(value) {
  return audioDataUrlPattern.test(String(value || ""));
}

function getAudioMimeType(value) {
  return String(value || "").match(audioDataUrlPattern)?.[1] || "audio";
}

function readJson(request, maxBytes) {
  return new Promise((resolve, reject) => {
    let data = "";
    request.on("data", (chunk) => {
      data += chunk;
      if (data.length > maxBytes) {
        reject(new Error("Audio asset request is too large"));
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
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(payload));
  return true;
}
