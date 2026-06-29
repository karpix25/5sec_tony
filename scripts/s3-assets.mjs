import { readFile } from "node:fs/promises";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { extname } from "node:path";

const dataUrlPattern = /^data:([^;]+);base64,([a-z0-9+/=\s]+)$/i;

export function isS3AssetStorageConfigured() {
  return Boolean(getS3Config());
}

export async function uploadDataUrlToS3(dataUrl, { prefix = "references" } = {}) {
  const parsed = parseDataUrl(dataUrl);
  return uploadBufferToS3({
    buffer: parsed.buffer,
    contentType: parsed.contentType,
    key: createAssetKey(prefix, parsed.ext)
  });
}

export async function uploadRemoteAssetToS3(url, { prefix = "remote", fallbackExt = ".bin" } = {}) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`Не удалось скачать asset для S3: ${response.status}`);
  const contentType = response.headers.get("content-type") || getContentTypeFromExt(url, "application/octet-stream");
  const buffer = Buffer.from(await response.arrayBuffer());
  return uploadBufferToS3({
    buffer,
    contentType,
    key: createAssetKey(prefix, getExtFromContent(url, contentType, fallbackExt))
  });
}

export async function uploadFileToS3(path, { prefix = "files", contentType = "" } = {}) {
  const buffer = await readFile(path);
  const finalContentType = contentType || getContentTypeFromExt(path, "application/octet-stream");
  return uploadBufferToS3({
    buffer,
    contentType: finalContentType,
    key: createAssetKey(prefix, getExtFromContent(path, finalContentType, ".bin"))
  });
}

export async function deleteS3AssetByUrl(url) {
  const config = getS3Config();
  if (!config) throw new Error("S3 storage is not configured");
  const encodedKey = getEncodedKeyFromS3Url(config, url);
  if (!encodedKey) return false;
  await deleteS3Object(config, encodedKey);
  return true;
}

async function uploadBufferToS3({ buffer, key, contentType }) {
  const config = getS3Config();
  if (!config) throw new Error("S3 storage is not configured");

  const bodyHash = sha256Hex(buffer);
  const amzDate = toAmzDate(new Date());
  const dateStamp = amzDate.slice(0, 8);
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  const target = getS3Target(config, encodedKey);
  const headers = {
    "content-type": contentType,
    host: target.host,
    "x-amz-content-sha256": bodyHash,
    "x-amz-date": amzDate
  };
  const authorization = signS3Put({ config, headers, canonicalPath: target.canonicalPath, bodyHash, dateStamp, amzDate });
  const result = await fetch(target.url, {
    method: "PUT",
    headers: { ...headers, authorization },
    body: buffer
  });

  if (!result.ok) {
    const text = await result.text().catch(() => "");
    throw new Error(`S3 upload failed: ${result.status} ${text.slice(0, 160)}`);
  }

  return getS3PublicUrl(config, encodedKey);
}

async function deleteS3Object(config, encodedKey) {
  const emptyHash = sha256Hex("");
  const amzDate = toAmzDate(new Date());
  const dateStamp = amzDate.slice(0, 8);
  const target = getS3Target(config, encodedKey);
  const headers = {
    host: target.host,
    "x-amz-content-sha256": emptyHash,
    "x-amz-date": amzDate
  };
  const authorization = signS3Request({
    config,
    method: "DELETE",
    headers,
    canonicalPath: target.canonicalPath,
    bodyHash: emptyHash,
    dateStamp,
    amzDate
  });
  const result = await fetch(target.url, {
    method: "DELETE",
    headers: { ...headers, authorization }
  });
  if (!result.ok && result.status !== 404) {
    const text = await result.text().catch(() => "");
    throw new Error(`S3 delete failed: ${result.status} ${text.slice(0, 160)}`);
  }
}

function signS3Put({ config, headers, canonicalPath, bodyHash, dateStamp, amzDate }) {
  return signS3Request({
    config,
    method: "PUT",
    headers,
    canonicalPath,
    bodyHash,
    dateStamp,
    amzDate
  });
}

function signS3Request({ config, method, headers, canonicalPath, bodyHash, dateStamp, amzDate }) {
  const credentialScope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const signedHeaders = Object.keys(headers).sort().join(";");
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map((name) => `${name}:${headers[name]}`)
    .join("\n") + "\n";
  const canonicalRequest = [
    method,
    canonicalPath,
    "",
    canonicalHeaders,
    signedHeaders,
    bodyHash
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest)
  ].join("\n");
  const signingKey = getSigningKey(config.secretAccessKey, dateStamp, config.region);
  const signature = hmacHex(signingKey, stringToSign);
  return `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

function getS3Config() {
  const bucket = process.env.S3_BUCKET || process.env.AWS_S3_BUCKET;
  const endpoint = normalizeS3Endpoint(process.env.S3_ENDPOINT || process.env.AWS_S3_ENDPOINT);
  const region = process.env.S3_REGION || process.env.AWS_REGION || "ru1";
  const accessKeyId = process.env.S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;
  if (!bucket || !region || !accessKeyId || !secretAccessKey) return null;
  return {
    bucket,
    region,
    endpoint,
    accessKeyId,
    secretAccessKey,
    publicBaseUrl: process.env.S3_PUBLIC_BASE_URL || process.env.AWS_CLOUDFRONT_URL || ""
  };
}

function getS3PublicUrl(config, key) {
  if (config.publicBaseUrl) return `${config.publicBaseUrl.replace(/\/$/, "")}/${key}`;
  if (config.endpoint) return `${config.endpoint}/${config.bucket}/${key}`;
  return `https://${config.bucket}.s3.${config.region}.amazonaws.com/${key}`;
}

function getS3Target(config, encodedKey) {
  if (config.endpoint) {
    const endpoint = new URL(config.endpoint);
    const canonicalPath = `/${config.bucket}/${encodedKey}`;
    return {
      host: endpoint.host,
      canonicalPath,
      url: `${config.endpoint}${canonicalPath}`
    };
  }

  const host = `${config.bucket}.s3.${config.region}.amazonaws.com`;
  return {
    host,
    canonicalPath: `/${encodedKey}`,
    url: `https://${host}/${encodedKey}`
  };
}

function getEncodedKeyFromS3Url(config, value) {
  const url = String(value || "").trim();
  if (!url) return "";
  const publicBase = config.publicBaseUrl.replace(/\/$/, "");
  if (publicBase && url.startsWith(`${publicBase}/`)) {
    return encodeKeyPath(url.slice(publicBase.length + 1));
  }
  if (config.endpoint) {
    const endpoint = new URL(config.endpoint);
    const parsed = safeUrl(url);
    if (!parsed || parsed.host !== endpoint.host) return "";
    const prefix = `/${config.bucket}/`;
    if (!parsed.pathname.startsWith(prefix)) return "";
    return encodeKeyPath(parsed.pathname.slice(prefix.length));
  }
  const parsed = safeUrl(url);
  const host = `${config.bucket}.s3.${config.region}.amazonaws.com`;
  if (parsed?.host !== host) return "";
  return encodeKeyPath(parsed.pathname.replace(/^\//, ""));
}

function safeUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function encodeKeyPath(value) {
  return String(value || "").split("/").map((part) => encodeURIComponent(decodeURIComponent(part))).join("/");
}

function normalizeS3Endpoint(value) {
  const endpoint = String(value || "").trim().replace(/\/$/, "");
  if (!endpoint) return "";
  try {
    const parsed = new URL(endpoint);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return "";
  }
}

function parseDataUrl(value) {
  const match = String(value || "").match(dataUrlPattern);
  if (!match) throw new Error("Некорректный data URL для S3");
  const contentType = match[1].toLowerCase().replace("image/jpg", "image/jpeg");
  const buffer = Buffer.from(match[2].replace(/\s/g, ""), "base64");
  if (!buffer.length) throw new Error("Пустой asset для S3");
  return { contentType, buffer, ext: getExtFromContent("", contentType, ".bin") };
}

function createAssetKey(prefix, ext) {
  const date = new Date().toISOString().slice(0, 10);
  return `anton-5-sec/${prefix}/${date}/${randomUUID()}${ext}`;
}

function getExtFromContent(source, contentType, fallback) {
  const ext = extname(String(source || "").split("?")[0]).toLowerCase();
  if (ext && ext.length <= 6) return ext;
  if (contentType.includes("png")) return ".png";
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return ".jpg";
  if (contentType.includes("webp")) return ".webp";
  if (contentType.includes("webm")) return ".webm";
  if (contentType.includes("mp4")) return ".mp4";
  if (contentType.includes("mpeg")) return ".mp3";
  if (contentType.includes("wav")) return ".wav";
  if (contentType.includes("ogg")) return ".ogg";
  return fallback;
}

function getContentTypeFromExt(source, fallback) {
  const ext = extname(String(source || "").split("?")[0]).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".webm") return "video/webm";
  if (ext === ".mp4") return "video/mp4";
  if (ext === ".mp3") return "audio/mpeg";
  if (ext === ".wav") return "audio/wav";
  if (ext === ".m4a") return "audio/mp4";
  if (ext === ".ogg") return "audio/ogg";
  return fallback;
}

function toAmzDate(date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key, value) {
  return createHmac("sha256", key).update(value).digest();
}

function hmacHex(key, value) {
  return createHmac("sha256", key).update(value).digest("hex");
}

function getSigningKey(secret, dateStamp, region) {
  const dateKey = hmac(`AWS4${secret}`, dateStamp);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, "s3");
  return hmac(serviceKey, "aws4_request");
}
