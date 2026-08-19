import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { isS3AssetStorageConfigured, uploadFileToS3 } from "./s3-assets.mjs";

const execFileAsync = promisify(execFile);
const alphaOutputDir = "generated/avatar-videos";

export async function handleAvatarAlphaVideoApi(request, response, url) {
  if (request.method !== "POST" || url.pathname !== "/api/avatar-videos/alpha") return false;

  try {
    const body = await readJson(request);
    if (!body.videoUrl) return sendJson(response, 400, { error: "videoUrl is required" });
    const result = await createAvatarAlphaVideo({ videoUrl: body.videoUrl });
    return sendJson(response, 200, result);
  } catch (error) {
    return sendJson(response, 502, { error: error.message || "Не удалось удалить хромакей" });
  }
}

export async function createAvatarAlphaVideo({ videoUrl }) {
  await mkdir(alphaOutputDir, { recursive: true });
  const runId = createAlphaRunId(videoUrl);
  const tempDir = join(tmpdir(), `anton-avatar-alpha-${runId}`);
  await mkdir(tempDir, { recursive: true });

  const inputPath = join(tempDir, `avatar${getAlphaSourceExt(videoUrl, ".mp4")}`);
  const outputPath = join(alphaOutputDir, `avatar-alpha-${runId}.webm`);

  try {
    await writeFile(inputPath, await readAlphaSourceBytes(videoUrl));
    await removeGreenWithFfmpeg({ inputPath, outputPath });
    const alphaVideoUrl = isS3AssetStorageConfigured()
      ? await uploadFileToS3(outputPath, { prefix: "avatar-videos/alpha", contentType: "video/webm" })
      : `/${outputPath}`;
    return { alphaVideoUrl, format: "webm-alpha", keyColor: "#00FF00" };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export function buildAvatarAlphaFfmpegArgs({ inputPath, outputPath }) {
  return [
    "-y",
    "-i", inputPath,
    "-an",
    "-vf", "chromakey=0x00FF00:0.18:0.08,format=yuva420p",
    "-c:v", "libvpx-vp9",
    "-pix_fmt", "yuva420p",
    "-auto-alt-ref", "0",
    "-deadline", "good",
    "-cpu-used", "4",
    outputPath
  ];
}

async function removeGreenWithFfmpeg({ inputPath, outputPath }) {
  await execFileAsync("ffmpeg", buildAvatarAlphaFfmpegArgs({ inputPath, outputPath }), { timeout: 120000 });
}

async function readAlphaSourceBytes(source) {
  const value = String(source || "");
  if (value.startsWith("data:")) return dataUrlToBuffer(value);
  if (/^https?:\/\//i.test(value)) {
    const result = await fetch(value);
    if (!result.ok) throw new Error(`Не удалось скачать хромакей-видео: ${result.status}`);
    return Buffer.from(await result.arrayBuffer());
  }
  if (value.startsWith("/")) return readFile(value.replace(/^\/+/, ""));
  throw new Error("Поддерживаются только http(s), data URL или локальный путь внутри проекта");
}

function dataUrlToBuffer(value) {
  const match = value.match(/^data:[^;]+;base64,(.+)$/i);
  if (!match) throw new Error("Некорректный data URL");
  return Buffer.from(match[1], "base64");
}

function getAlphaSourceExt(value, fallback) {
  const source = String(value || "").split("?")[0];
  if (source.startsWith("data:video/mp4")) return ".mp4";
  if (source.startsWith("data:video/webm")) return ".webm";
  const ext = extname(source).toLowerCase();
  return ext && ext.length <= 5 ? ext : fallback;
}

function createAlphaRunId(value) {
  return createHash("sha1").update(`${value}|${Date.now()}`).digest("hex").slice(0, 12);
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
