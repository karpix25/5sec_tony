import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";

const yandexApiUrl = "https://cloud-api.yandex.net/v1/disk/resources";
const defaultFoldersRoot = "disk:/ВИДЕО";
const maxFolderDepth = 3;
const maxFolderCount = 200;

export async function handleYandexDiskApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/yandex-disk/folders") {
    return handleYandexFoldersApi(request, response, url);
  }
  if (request.method !== "POST" || url.pathname !== "/api/yandex-disk/upload") return false;

  try {
    const token = process.env.YANDEX_DISK_TOKEN || process.env.YANDEX_OAUTH_TOKEN;
    if (!token) return sendJson(response, 500, { error: "YANDEX_DISK_TOKEN is not configured" });

    const body = await readJson(request);
    const fileUrl = String(body.fileUrl || "");
    const targetFolder = normalizeDiskFolder(body.targetFolder);
    const fileName = normalizeDiskFileName(body.fileName || basename(fileUrl.split("?")[0]) || "anton-video.mp4");
    if (!fileUrl) return sendJson(response, 400, { error: "fileUrl is required" });

    await ensureYandexFolder(token, targetFolder);
    const diskPath = `${targetFolder}/${fileName}`;
    const uploadUrl = await getUploadUrl(token, diskPath);
    const bytes = await readSourceBytes(fileUrl);
    const upload = await fetch(uploadUrl, { method: "PUT", body: bytes });
    if (!upload.ok) throw new Error(`Яндекс.Диск не принял файл: ${upload.status}`);

    return sendJson(response, 200, { diskPath, fileName });
  } catch (error) {
    return sendJson(response, 502, { error: error.message || "Не удалось сохранить файл на Яндекс.Диск" });
  }
}

async function handleYandexFoldersApi(request, response, url) {
  try {
    const token = process.env.YANDEX_DISK_TOKEN || process.env.YANDEX_OAUTH_TOKEN;
    if (!token) return sendJson(response, 500, { error: "YANDEX_DISK_TOKEN is not configured" });

    const root = normalizeDiskFolder(url.searchParams.get("root") || defaultFoldersRoot);
    const folders = await listYandexFolders(token, root);
    return sendJson(response, 200, { root, folders });
  } catch (error) {
    return sendJson(response, 502, { error: error.message || "Не удалось получить папки Яндекс.Диска" });
  }
}

export async function listYandexFolders(token, root) {
  const folders = [];
  await collectYandexFolders(token, root, folders, 0);
  return folders.slice(0, maxFolderCount);
}

async function collectYandexFolders(token, path, folders, depth) {
  if (folders.length >= maxFolderCount) return;
  folders.push(path);
  if (depth >= maxFolderDepth) return;

  const resource = await getYandexResource(token, path);
  const children = resource._embedded?.items || [];
  for (const item of children) {
    if (item.type !== "dir" || !item.path) continue;
    await collectYandexFolders(token, normalizeDiskFolder(item.path), folders, depth + 1);
    if (folders.length >= maxFolderCount) return;
  }
}

async function ensureYandexFolder(token, folder) {
  const parts = folder.replace(/^disk:\//, "").split("/").filter(Boolean);
  let current = "disk:";
  for (const part of parts) {
    current = `${current}/${part}`;
    const result = await fetch(`${yandexApiUrl}?path=${encodeURIComponent(current)}`, {
      method: "PUT",
      headers: { Authorization: getYandexAuthHeader(token) }
    });
    if (!result.ok && result.status !== 409) {
      const payload = await result.json().catch(() => ({}));
      throw new Error(payload.message || `Не удалось создать папку Яндекс.Диска: ${current}`);
    }
  }
}

async function getYandexResource(token, path) {
  const result = await fetch(`${yandexApiUrl}?path=${encodeURIComponent(path)}&limit=1000`, {
    headers: { Authorization: getYandexAuthHeader(token) }
  });
  const payload = await result.json().catch(() => ({}));
  if (!result.ok) throw new Error(payload.message || `Не удалось прочитать папку Яндекс.Диска: ${path}`);
  return payload;
}

async function getUploadUrl(token, path) {
  const result = await fetch(`${yandexApiUrl}/upload?path=${encodeURIComponent(path)}&overwrite=true`, {
    headers: { Authorization: getYandexAuthHeader(token) }
  });
  const payload = await result.json().catch(() => ({}));
  if (!result.ok || !payload.href) throw new Error(payload.message || "Яндекс.Диск не вернул upload URL");
  return payload.href;
}

async function readSourceBytes(source) {
  const value = String(source || "");
  if (value.startsWith("data:")) return dataUrlToBuffer(value);
  if (/^https?:\/\//i.test(value)) {
    const result = await fetch(value);
    if (!result.ok) throw new Error(`Не удалось скачать файл для Яндекс.Диска: ${result.status}`);
    return Buffer.from(await result.arrayBuffer());
  }
  if (value.startsWith("/")) return readFile(value.replace(/^\/+/, ""));
  return readFile(value);
}

function normalizeDiskFolder(value) {
  const raw = String(value || "").trim() || "disk:/Anton 5 sec";
  const withoutPrefix = raw.replace(/^Yandex Disk\s*\/?/i, "").replace(/^disk:\/*/i, "");
  return `disk:/${withoutPrefix.split("/").map((part) => part.trim()).filter(Boolean).join("/")}`;
}

function normalizeDiskFileName(value) {
  const source = String(value || "anton-video.mp4").trim().replace(/[\\/:*?"<>|]+/g, "-");
  return extname(source) ? source : `${source}.mp4`;
}

function getYandexAuthHeader(token) {
  const value = String(token || "").trim();
  return /^OAuth\s+/i.test(value) ? value : `OAuth ${value}`;
}

function dataUrlToBuffer(value) {
  const match = value.match(/^data:[^;]+;base64,(.+)$/i);
  if (!match) throw new Error("Некорректный data URL для Яндекс.Диска");
  return Buffer.from(match[1], "base64");
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let data = "";
    request.on("data", (chunk) => {
      data += chunk;
    });
    request.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
  return true;
}
