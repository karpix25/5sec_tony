import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { isS3AssetStorageConfigured, uploadFileToS3 } from "./s3-assets.mjs";

const execFileAsync = promisify(execFile);
const outputDir = "generated/avatar-videos";

export async function handleCompositeVideoApi(request, response, url) {
  if (request.method !== "POST" || url.pathname !== "/api/avatar-videos/composite") return false;

  try {
    const body = await readJson(request);
    if (!body.avatarVideoUrl) return sendJson(response, 400, { error: "avatarVideoUrl is required" });
    if (!body.backgroundImageUrl) return sendJson(response, 400, { error: "backgroundImageUrl is required" });

    const result = await createCompositeVideo({
      avatarVideoUrl: body.avatarVideoUrl,
      backgroundImageUrl: body.backgroundImageUrl,
      audioUrl: body.audioUrl || body.audioData || ""
    });
    return sendJson(response, 200, result);
  } catch (error) {
    return sendJson(response, 502, { error: error.message || "Не удалось собрать итоговое видео" });
  }
}

export async function createCompositeVideo({ avatarVideoUrl, backgroundImageUrl, audioUrl = "" }) {
  await mkdir(outputDir, { recursive: true });
  const runId = createRunId(`${avatarVideoUrl}|${backgroundImageUrl}|${Date.now()}`);
  const tempDir = join(tmpdir(), `anton-avatar-composite-${runId}`);
  await mkdir(tempDir, { recursive: true });

  const backgroundPath = join(tempDir, `background${getSourceExt(backgroundImageUrl, ".png")}`);
  const avatarPath = join(tempDir, `avatar${getSourceExt(avatarVideoUrl, ".mp4")}`);
  const audioPath = audioUrl ? join(tempDir, `audio${getSourceExt(audioUrl, ".mp3")}`) : "";
  const outputPath = join(outputDir, `avatar-composite-${runId}.mp4`);

  try {
    await writeFile(backgroundPath, await readSourceBytes(backgroundImageUrl));
    await writeFile(avatarPath, await readSourceBytes(avatarVideoUrl));
    if (audioPath) await writeFile(audioPath, await readSourceBytes(audioUrl));
    await composeWithFfmpeg({ backgroundPath, avatarPath, audioPath, outputPath });
    const videoUrl = isS3AssetStorageConfigured()
      ? await uploadFileToS3(outputPath, { prefix: "avatar-videos/composite", contentType: "video/mp4" })
      : `/${outputPath}`;
    return { videoUrl, duration: "5", placement: "lower-left-safe-zone", hasAudio: Boolean(audioPath) };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function composeWithFfmpeg({ backgroundPath, avatarPath, audioPath, outputPath }) {
  const filter = [
    "[0:v]scale=1024:1792:force_original_aspect_ratio=increase,crop=1024:1792,setsar=1,format=rgba[bg]",
    "[1:v]trim=duration=5,setpts=PTS-STARTPTS,fps=30,scale=460:-2:force_original_aspect_ratio=decrease,chromakey=0x00FF00:0.18:0.08,format=rgba[avatar]",
    "[bg][avatar]overlay=x=72:y=1360-h:format=auto,format=yuv420p[out]"
  ].join(";");

  const args = [
    "-y",
    "-loop", "1",
    "-t", "5",
    "-i", backgroundPath,
    "-i", avatarPath,
    ...(audioPath ? ["-stream_loop", "-1", "-i", audioPath] : []),
    "-filter_complex", filter,
    "-map", "[out]",
    ...(audioPath ? ["-map", "2:a:0", "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2"] : ["-an"]),
    "-t", "5",
    "-r", "30",
    "-movflags", "+faststart",
    outputPath
  ];

  await execFileAsync("ffmpeg", args, { timeout: 120000 });
}

async function readSourceBytes(source) {
  const value = String(source || "");
  if (value.startsWith("data:")) return dataUrlToBuffer(value);
  if (/^https?:\/\//i.test(value)) {
    const result = await fetch(value);
    if (!result.ok) throw new Error(`Не удалось скачать ресурс для видео: ${result.status}`);
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

function getSourceExt(value, fallback) {
  const source = String(value || "").split("?")[0];
  if (source.startsWith("data:image/png")) return ".png";
  if (source.startsWith("data:image/jpeg")) return ".jpg";
  if (source.startsWith("data:image/webp")) return ".webp";
  if (source.startsWith("data:video/mp4")) return ".mp4";
  if (source.startsWith("data:audio/wav")) return ".wav";
  if (source.startsWith("data:audio/mpeg")) return ".mp3";
  if (source.startsWith("data:audio/mp4")) return ".m4a";
  if (source.startsWith("data:audio/ogg")) return ".ogg";
  const ext = extname(source).toLowerCase();
  return ext && ext.length <= 5 ? ext : fallback;
}

function createRunId(value) {
  return createHash("sha1").update(value).digest("hex").slice(0, 12);
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
