import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { createYandexDiskError, withYandexDiskMutationLock, withYandexDiskRetry } from "./yandex-disk-resilience.mjs";

const yandexApiUrl = "https://cloud-api.yandex.net/v1/disk/resources";
const defaultFoldersRoot = "disk:/ВИДЕО";
const defaultFolderDepth = 2;
const maxFolderDepth = 6;
const defaultFolderCount = 120;
const folderPageSize = 200;
const folderRequestTimeoutMs = 20000;
const folderFields = "_embedded.items.name,_embedded.items.path,_embedded.items.type,_embedded.limit,_embedded.offset,_embedded.total,path,name,type";
const publishedResourceFields = "path,public_url,name,type";
const uploadedResourceFields = "path,name,type,size,public_url";

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

    const uploadResult = await uploadYandexDiskFile({
      token,
      targetFolder,
      fileName,
      fileUrl
    });

    return sendJson(response, 200, {
      diskPath: uploadResult.diskPath,
      diskUrl: uploadResult.publicUrl,
      publicUrl: uploadResult.publicUrl,
      fileName,
      diskVerifiedAt: uploadResult.verifiedAt,
      diskSize: uploadResult.size,
      diskVerification: uploadResult.verification
    });
  } catch (error) {
    return sendJson(response, 502, { error: error.message || "Не удалось сохранить файл на Яндекс.Диск" });
  }
}

export async function uploadYandexDiskFile({ token, targetFolder, fileName, fileUrl, bytes }) {
  const normalizedFolder = normalizeDiskFolder(targetFolder);
  const normalizedName = normalizeDiskFileName(fileName || basename(String(fileUrl || "").split("?")[0]) || "anton-video.mp4");
  const diskPath = `${normalizedFolder}/${normalizedName}`;
  const sourceBytes = bytes || await readSourceBytes(fileUrl);
  return withYandexDiskMutationLock(() => uploadYandexDiskBytes({
    token,
    targetFolder: normalizedFolder,
    diskPath,
    bytes: sourceBytes
  }));
}

async function uploadYandexDiskBytes({ token, targetFolder, diskPath, bytes }) {
  await ensureYandexFolder(token, targetFolder);
  await uploadYandexDiskResource(token, diskPath, bytes);
  const publicUrl = await publishYandexResource(token, diskPath);
  const verified = await verifyYandexUploadedResource(token, diskPath, { requirePublicUrl: true });
  return {
    diskPath,
    publicUrl: publicUrl || verified.publicUrl,
    ...verified
  };
}

async function handleYandexFoldersApi(request, response, url) {
  try {
    const token = process.env.YANDEX_DISK_TOKEN || process.env.YANDEX_OAUTH_TOKEN;
    if (!token) return sendJson(response, 500, { error: "YANDEX_DISK_TOKEN is not configured" });

    const root = normalizeDiskFolder(url.searchParams.get("root") || defaultFoldersRoot);
    const depth = normalizeNumber(url.searchParams.get("depth"), defaultFolderDepth, 0, maxFolderDepth);
    const max = normalizeNumber(url.searchParams.get("max"), defaultFolderCount, 1, defaultFolderCount);
    const folders = await listYandexFolders(token, root, { depth, max });
    return sendJson(response, 200, { root, folders, truncated: folders.length >= max });
  } catch (error) {
    return sendJson(response, 502, { error: error.message || "Не удалось получить папки Яндекс.Диска" });
  }
}

export async function listYandexFolders(token, root, options = {}) {
  const maxDepth = normalizeNumber(options.depth, defaultFolderDepth, 0, maxFolderDepth);
  const maxFolders = normalizeNumber(options.max, defaultFolderCount, 1, defaultFolderCount);
  const normalizedRoot = normalizeDiskFolder(root);
  const folders = [buildFolderOption(normalizedRoot, 0, normalizedRoot)];
  const queue = [{ path: normalizedRoot, depth: 0 }];

  while (queue.length && folders.length < maxFolders) {
    const current = queue.shift();
    if (current.depth >= maxDepth) continue;

    const children = await getYandexFolderChildren(token, current.path);
    for (const child of children) {
      if (folders.length >= maxFolders) break;
      const childPath = normalizeDiskFolder(child.path);
      const nextDepth = current.depth + 1;
      folders.push(buildFolderOption(childPath, nextDepth, normalizedRoot, child.name));
      queue.push({ path: childPath, depth: nextDepth });
    }
  }

  return folders;
}

async function getYandexFolderChildren(token, path) {
  const folders = [];
  let offset = 0;
  let total = Infinity;
  while (offset < total) {
    const resource = await getYandexResource(token, path, { offset });
    const embedded = resource._embedded || {};
    const items = embedded.items || [];
    const totalCount = Number(embedded.total);
    const pageLimit = Number(embedded.limit);
    folders.push(...items.filter((item) => item.type === "dir" && item.path));
    total = Number.isFinite(totalCount) ? totalCount : offset + items.length;
    offset += Number.isFinite(pageLimit) ? pageLimit : folderPageSize;
    if (items.length === 0) break;
  }
  return folders.sort((first, second) => String(first.name || first.path).localeCompare(String(second.name || second.path), "ru"));
}

async function ensureYandexFolder(token, folder) {
  const parts = folder.replace(/^disk:\//, "").split("/").filter(Boolean);
  let current = "disk:";
  for (const part of parts) {
    current = `${current}/${part}`;
    await withYandexDiskRetry(async () => {
      const result = await fetch(`${yandexApiUrl}?path=${encodeURIComponent(current)}`, {
        method: "PUT",
        headers: { Authorization: getYandexAuthHeader(token) }
      });
      if (result.ok || result.status === 409) return;
      const payload = await result.json().catch(() => ({}));
      throw createYandexHttpError(result.status, payload, `Не удалось создать папку Яндекс.Диска: ${current}`);
    });
  }
}

async function getYandexResource(token, path, options = {}) {
  const params = new URLSearchParams({
    path,
    limit: String(folderPageSize),
    offset: String(options.offset || 0),
    fields: options.fields || folderFields
  });
  const result = await fetch(`${yandexApiUrl}?${params}`, {
    headers: { Authorization: getYandexAuthHeader(token) },
    signal: AbortSignal.timeout(folderRequestTimeoutMs)
  });
  const payload = await result.json().catch(() => ({}));
  if (!result.ok) throw createYandexHttpError(result.status, payload, `Не удалось прочитать ресурс Яндекс.Диска: ${path}`);
  return payload;
}

async function getUploadUrl(token, path) {
  return await withYandexDiskRetry(async () => {
    const result = await fetch(`${yandexApiUrl}/upload?path=${encodeURIComponent(path)}&overwrite=true`, {
      headers: { Authorization: getYandexAuthHeader(token) }
    });
    const payload = await result.json().catch(() => ({}));
    if (!result.ok) throw createYandexHttpError(result.status, payload, "Яндекс.Диск не вернул upload URL");
    if (!payload.href) throw createYandexDiskError("Яндекс.Диск не вернул upload URL", { retryable: true });
    return payload.href;
  });
}

async function uploadYandexDiskResource(token, path, bytes) {
  await withYandexDiskRetry(async () => {
    const uploadUrl = await getUploadUrl(token, path);
    const upload = await fetch(uploadUrl, { method: "PUT", body: bytes });
    if (!upload.ok) throw createYandexDiskError(`Яндекс.Диск не принял файл: ${upload.status}`, { status: upload.status });
  });
}

export async function verifyYandexUploadedResource(token, path, options = {}) {
  const resource = await withYandexDiskRetry(async () => {
    try {
      const uploaded = await getYandexResource(token, path, { fields: uploadedResourceFields });
      if (uploaded.type !== "file") {
        throw createYandexDiskError(`Яндекс.Диск вернул не файл после загрузки: ${path}`, { retryable: true });
      }
      if (Number(uploaded.size || 0) <= 0) {
        throw createYandexDiskError(`Яндекс.Диск вернул пустой файл после загрузки: ${path}`, { retryable: true });
      }
      if (options.requirePublicUrl && !uploaded.public_url) {
        throw createYandexDiskError(`Яндекс.Диск ещё не вернул публичную ссылку: ${path}`, { retryable: true });
      }
      return uploaded;
    } catch (error) {
      if (Number(error?.status) === 404) {
        throw createYandexDiskError(`Яндекс.Диск ещё не видит загруженный файл: ${path}`, { status: 404, retryable: true });
      }
      throw error;
    }
  }, options.retryOptions || { attempts: 8, baseDelayMs: 1000, maxDelayMs: 60000 });

  const verifiedAt = new Date().toISOString();
  return {
    path: resource.path || path,
    name: resource.name || basename(path),
    type: resource.type || "file",
    size: Number(resource.size || 0),
    publicUrl: resource.public_url || "",
    verifiedAt,
    verification: {
      path: resource.path || path,
      type: resource.type || "file",
      size: Number(resource.size || 0),
      publicUrl: resource.public_url || "",
      verifiedAt
    }
  };
}

async function publishYandexResource(token, path) {
  await withYandexDiskRetry(async () => {
    const result = await fetch(`${yandexApiUrl}/publish?path=${encodeURIComponent(path)}`, {
      method: "PUT",
      headers: { Authorization: getYandexAuthHeader(token) }
    });
    if (result.ok || result.status === 409) return;
    const payload = await result.json().catch(() => ({}));
    throw createYandexHttpError(result.status, payload, `Не удалось опубликовать файл Яндекс.Диска: ${path}`);
  });

  const resource = await withYandexDiskRetry(async () => {
    const published = await getYandexPublishedResource(token, path);
    if (!published.public_url) {
      throw createYandexDiskError(`Яндекс.Диск ещё не вернул публичную ссылку: ${path}`, { retryable: true });
    }
    return published;
  }, { attempts: 8, baseDelayMs: 1000 });

  return resource.public_url;
}

async function getYandexPublishedResource(token, path) {
  const params = new URLSearchParams({
    path,
    fields: publishedResourceFields
  });
  const result = await fetch(`${yandexApiUrl}?${params}`, {
    headers: { Authorization: getYandexAuthHeader(token) }
  });
  const payload = await result.json().catch(() => ({}));
  if (!result.ok) throw createYandexHttpError(result.status, payload, `Не удалось получить публичную ссылку Яндекс.Диска: ${path}`);
  return payload;
}

function createYandexHttpError(status, payload, fallbackMessage) {
  const message = payload?.message || payload?.description || payload?.error || fallbackMessage;
  return createYandexDiskError(message, { status, payload });
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

function buildFolderOption(path, depth, root, name = "") {
  const relative = path === root ? basename(root) : path.replace(`${root}/`, "");
  return {
    path,
    depth,
    name: name || basename(path),
    label: path === root ? path : relative
  };
}

function normalizeNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
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
  return readJsonRequest(request);
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
  return true;
}
import { readJsonRequest } from "./request-body.mjs";
