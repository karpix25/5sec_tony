import { randomUUID } from "node:crypto";
import { deflateSync } from "node:zlib";
import { isMultipartRequest, readMultipartForm } from "./multipart-form.mjs";
import { isS3AssetStorageConfigured, uploadDataUrlToS3 } from "./s3-assets.mjs";

const dataUrlPattern = /^data:(image\/(?:png|jpeg|jpg|webp));base64,([a-z0-9+/=\s]+)$/i;
const builtInSafeZoneAssetId = "safe-zone-placement-mask.png";
const assets = new Map();
let cachedPublicBaseUrl;
let cachedSafeZoneMaskPng;

export async function handleReferenceAssetsApi(request, response, url) {
  if (request.method === "POST" && url.pathname === "/api/reference-assets") {
    return saveReferenceAsset(request, response);
  }
  if (request.method !== "GET" || !url.pathname.startsWith("/api/reference-assets/")) return false;
  const id = decodeURIComponent(url.pathname.replace("/api/reference-assets/", ""));
  if (id === builtInSafeZoneAssetId) return sendBuiltInSafeZoneMask(response);
  const asset = assets.get(id);
  if (!asset) {
    response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "Reference asset not found" }));
    return true;
  }
  response.writeHead(200, {
    "Content-Type": asset.mimeType,
    "Cache-Control": "public, max-age=3600",
    "Access-Control-Allow-Origin": "*"
  });
  response.end(asset.buffer);
  return true;
}

function sendBuiltInSafeZoneMask(response) {
  response.writeHead(200, {
    "Content-Type": "image/png",
    "Cache-Control": "public, max-age=31536000, immutable",
    "Access-Control-Allow-Origin": "*"
  });
  response.end(getSafeZoneMaskPng());
  return true;
}

async function saveReferenceAsset(request, response) {
  try {
    const body = await readReferenceAssetBody(request);
    if (!isDataImageUrl(body.imageData)) {
      return sendJson(response, 400, { error: "imageData must be a png, jpeg or webp data URL" });
    }
    const url = isS3AssetStorageConfigured()
      ? await uploadDataUrlToS3(body.imageData, { prefix: "references" })
      : storeReferenceAsset(body.imageData, "");
    return sendJson(response, 200, { url, imageName: body.imageName || "" });
  } catch (error) {
    return sendJson(response, 502, { error: error.message || "Не удалось сохранить reference image" });
  }
}

async function readReferenceAssetBody(request) {
  if (!isMultipartRequest(request.headers)) return readJson(request);
  const form = await readMultipartForm(request, request.headers["content-type"], 15 * 1024 * 1024);
  const file = form.files.image || form.files.imageData;
  if (!file) return { imageData: "", imageName: form.fields.imageName || "" };
  return {
    imageData: createDataImageUrl(file.mimeType, file.buffer),
    imageName: form.fields.imageName || file.filename || ""
  };
}

export async function resolveImageInputUrls(inputUrls, request) {
  const urls = Array.isArray(inputUrls) ? inputUrls.slice(0, 16) : [];
  const publicBaseUrl = await getPublicBaseUrl(request);
  const resolved = [];

  for (const value of urls) {
    if (isRemoteUrl(value)) {
      resolved.push(value);
      continue;
    }
    if (isSameOriginAssetUrl(value)) {
      const publicBaseUrl = await getPublicBaseUrl(request);
      if (!publicBaseUrl) {
        throw new Error("Для сохраненных reference assets нужен публичный URL приложения: настройте PUBLIC_BASE_URL/APP_PUBLIC_URL/NGROK_URL или S3.");
      }
      resolved.push(`${publicBaseUrl.replace(/\/$/, "")}${value}`);
      continue;
    }
    if (!isDataImageUrl(value)) continue;
    if (isS3AssetStorageConfigured()) {
      resolved.push(await uploadDataUrlToS3(value, { prefix: "references" }));
      continue;
    }
    if (!publicBaseUrl) {
      throw new Error("Для локальных фото нужен S3 или публичный URL приложения: настройте S3_BUCKET/S3_REGION/S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY или запустите ngrok.");
    }
    resolved.push(storeReferenceAsset(value, publicBaseUrl));
  }

  return resolved;
}

export function summarizeInputRefs({ rawInputUrls, inputRefs, resolvedInputUrls }) {
  const refs = Array.isArray(inputRefs) ? inputRefs : [];
  return {
    rawInputUrls: rawInputUrls.length,
    resolvedInputUrls: resolvedInputUrls.length,
    localInputUrls: rawInputUrls.filter(isDataImageUrl).length,
    remoteInputUrls: rawInputUrls.filter(isRemoteUrl).length,
    safeZoneRefs: refs.filter((item) => item.role === "safe_zone").length,
    productRefs: refs.filter((item) => item.role === "product").length,
    localProductRefs: refs.filter((item) => item.role === "product" && item.isLocalData).length,
    designRefs: refs.filter((item) => item.role === "design").length
  };
}

function storeReferenceAsset(dataUrl, publicBaseUrl) {
  const parsed = parseDataImageUrl(dataUrl);
  return storeReferenceAssetBuffer(parsed.buffer, parsed.mimeType, publicBaseUrl);
}

function storeReferenceAssetBuffer(buffer, mimeType, publicBaseUrl) {
  const id = randomUUID();
  assets.set(id, { mimeType, buffer, createdAt: Date.now() });
  const path = `/api/reference-assets/${encodeURIComponent(id)}`;
  return publicBaseUrl ? `${publicBaseUrl.replace(/\/$/, "")}${path}` : path;
}

function parseDataImageUrl(value) {
  const match = String(value || "").match(dataUrlPattern);
  if (!match) throw new Error("Неподдерживаемый формат reference image");
  const mimeType = match[1].toLowerCase().replace("image/jpg", "image/jpeg");
  const buffer = Buffer.from(match[2].replace(/\s/g, ""), "base64");
  if (!buffer.length) throw new Error("Пустой reference image");
  if (buffer.length > 12 * 1024 * 1024) throw new Error("Reference image слишком большой, максимум 12 MB");
  return { mimeType, buffer, createdAt: Date.now() };
}

async function getPublicBaseUrl(request) {
  const envUrl = normalizePublicBaseUrl(process.env.PUBLIC_BASE_URL || process.env.APP_PUBLIC_URL || process.env.NGROK_URL);
  if (envUrl) return envUrl;

  const forwardedHost = request.headers["x-forwarded-host"];
  const host = Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost || request.headers.host || "";
  const forwardedProto = request.headers["x-forwarded-proto"];
  const proto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto || "https";
  if (host && isPublicHost(host)) return `${proto}://${host}`;

  if (cachedPublicBaseUrl) return cachedPublicBaseUrl;
  cachedPublicBaseUrl = await detectNgrokBaseUrl();
  return cachedPublicBaseUrl;
}

async function detectNgrokBaseUrl() {
  try {
    const response = await fetch("http://127.0.0.1:4040/api/tunnels", { signal: AbortSignal.timeout(800) });
    const payload = await response.json();
    const tunnel = (payload.tunnels || []).find((item) => /^https:\/\//.test(item.public_url));
    return normalizePublicBaseUrl(tunnel?.public_url);
  } catch {
    return "";
  }
}

function normalizePublicBaseUrl(value) {
  const url = String(value || "").trim().replace(/\/$/, "");
  if (!/^https?:\/\//.test(url)) return "";
  try {
    const parsed = new URL(url);
    return isLocalHost(parsed.host) ? "" : `${parsed.protocol}//${parsed.host}`;
  } catch {
    return "";
  }
}

function isRemoteUrl(value) {
  return /^https?:\/\//.test(String(value || ""));
}

function isDataImageUrl(value) {
  return dataUrlPattern.test(String(value || ""));
}

function isSameOriginAssetUrl(value) {
  return /^\/api\/reference-assets\/[^/?#]+/.test(String(value || ""));
}

function createDataImageUrl(mimeType, buffer) {
  const normalized = String(mimeType || "").toLowerCase().replace("image/jpg", "image/jpeg");
  if (!/^image\/(?:png|jpeg|webp)$/.test(normalized)) throw new Error("Неподдерживаемый формат reference image");
  if (!buffer.length || buffer.length > 12 * 1024 * 1024) throw new Error("Reference image слишком большой, максимум 12 MB");
  return `data:${normalized};base64,${buffer.toString("base64")}`;
}

function getSafeZoneMaskPng() {
  if (cachedSafeZoneMaskPng) return cachedSafeZoneMaskPng;
  cachedSafeZoneMaskPng = createPlacementMaskPng({
    width: 1080,
    height: 1920,
    safe: { x0: 150, x1: 830, y0: 280, y1: 1300 }
  });
  return cachedSafeZoneMaskPng;
}

function createPlacementMaskPng({ width, height, safe }) {
  const forbidden = [126, 61, 219, 255];
  const allowed = [255, 255, 255, 255];
  const raw = Buffer.alloc((width * 4 + 1) * height);
  let offset = 0;
  for (let y = 0; y < height; y += 1) {
    raw[offset++] = 0;
    for (let x = 0; x < width; x += 1) {
      const color = x >= safe.x0 && x <= safe.x1 && y >= safe.y0 && y <= safe.y1 ? allowed : forbidden;
      raw[offset++] = color[0];
      raw[offset++] = color[1];
      raw[offset++] = color[2];
      raw[offset++] = color[3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

function pngChunk(type, data) {
  const name = Buffer.from(type);
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  name.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length);
  return chunk;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const crcTable = new Uint32Array(256).map((_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});

function isLocalHost(host) {
  const hostname = String(host || "").replace(/^\[/, "").split("]")[0].split(":")[0];
  return /^localhost$/i.test(hostname) || /^127\./.test(hostname) || hostname === "0.0.0.0" || hostname === "::1";
}

function isPublicHost(host) {
  const hostname = String(host || "").replace(/^\[/, "").split("]")[0].split(":")[0];
  return !isLocalHost(hostname) && hostname.includes(".");
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let data = "";
    request.on("data", (chunk) => {
      data += chunk;
      if (data.length > 15 * 1024 * 1024) {
        reject(new Error("Reference image request is too large"));
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
