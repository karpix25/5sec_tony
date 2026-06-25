import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { normalizeCtaOverlay } from "../src/domain/cta-overlay.js";

const execFileAsync = promisify(execFile);
const outputDir = "generated/avatar-videos";

export async function handleCompositeVideoApi(request, response, url) {
  if (request.method !== "POST" || url.pathname !== "/api/avatar-videos/composite") return false;

  try {
    const body = await readJson(request);
    if (!body.backgroundImageUrl) return sendJson(response, 400, { error: "backgroundImageUrl is required" });

    const result = await createCompositeVideo({
      avatarVideoUrl: body.avatarVideoUrl,
      backgroundImageUrl: body.backgroundImageUrl,
      audioUrl: body.audioUrl || body.audioData || "",
      overlay: body.overlay || body.placement || {},
      ctaOverlay: body.ctaOverlay || body.cta || {}
    });
    return sendJson(response, 200, result);
  } catch (error) {
    return sendJson(response, 502, { error: error.message || "Не удалось собрать итоговое видео" });
  }
}

export async function createCompositeVideo({ avatarVideoUrl, backgroundImageUrl, audioUrl = "", overlay = {}, ctaOverlay = {} }) {
  await mkdir(outputDir, { recursive: true });
  const runId = createRunId(`${avatarVideoUrl}|${backgroundImageUrl}|${Date.now()}`);
  const tempDir = join(tmpdir(), `anton-avatar-composite-${runId}`);
  await mkdir(tempDir, { recursive: true });

  const backgroundPath = join(tempDir, `background${getSourceExt(backgroundImageUrl, ".png")}`);
  const avatarPath = avatarVideoUrl ? join(tempDir, `avatar${getSourceExt(avatarVideoUrl, ".mp4")}`) : "";
  const ctaImageUrl = getCtaBadgeImageUrl(ctaOverlay);
  const ctaBadgePath = ctaImageUrl ? join(tempDir, `cta-badge${getSourceExt(ctaImageUrl, ".png")}`) : "";
  const audioPath = audioUrl ? join(tempDir, `audio${getSourceExt(audioUrl, ".mp3")}`) : "";
  const outputPath = join(outputDir, `avatar-composite-${runId}.mp4`);

  try {
    await writeFile(backgroundPath, await readSourceBytes(backgroundImageUrl));
    if (avatarPath) await writeFile(avatarPath, await readSourceBytes(avatarVideoUrl));
    if (ctaBadgePath) await writeFile(ctaBadgePath, await readSourceBytes(ctaImageUrl));
    if (audioPath) await writeFile(audioPath, await readSourceBytes(audioUrl));
    await composeWithFfmpeg({ backgroundPath, avatarPath, ctaBadgePath, audioPath, outputPath, overlay, ctaOverlay });
    const videoUrl = `/${outputPath}`;
    return { videoUrl, duration: "5", placement: normalizeAvatarOverlay(overlay), ctaOverlay: normalizeCtaOverlay(ctaOverlay), hasAudio: Boolean(audioPath) };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function composeWithFfmpeg({ backgroundPath, avatarPath, ctaBadgePath, audioPath, outputPath, overlay, ctaOverlay }) {
  const hasAvatarInput = Boolean(avatarPath);
  const filter = buildCompositeVideoFilter({
    overlay,
    ctaOverlay,
    hasCtaBadgeInput: Boolean(ctaBadgePath),
    hasAvatarInput
  });
  const audioInputIndex = hasAvatarInput
    ? (ctaBadgePath ? 3 : 2)
    : (ctaBadgePath ? 2 : 1);
  const args = [
    "-y",
    "-loop", "1",
    "-t", "5",
    "-i", backgroundPath,
    ...(avatarPath ? ["-i", avatarPath] : []),
    ...(ctaBadgePath ? ["-loop", "1", "-t", "5", "-i", ctaBadgePath] : []),
    ...(audioPath ? ["-stream_loop", "-1", "-i", audioPath] : []),
    "-filter_complex", filter,
    "-map", "[out]",
    ...(audioPath ? ["-map", `${audioInputIndex}:a:0`, "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2"] : ["-an"]),
    "-t", "5",
    "-r", "30",
    "-movflags", "+faststart",
    outputPath
  ];

  await execFileAsync("ffmpeg", args, { timeout: 120000 });
}

export function buildAvatarOverlayFilter(overlay = {}) {
  return buildCompositeVideoFilter({ overlay, ctaOverlay: { enabled: false }, hasAvatarInput: true });
}

export function buildCompositeVideoFilter({ overlay = {}, ctaOverlay = {}, hasCtaBadgeInput = false, hasAvatarInput = true } = {}) {
  const placement = normalizeAvatarOverlay(overlay);
  const cta = normalizeCtaOverlay(ctaOverlay);
  const avatarWidth = Math.round(1024 * (placement.scale / 100));
  const anchorX = Math.round(1024 * (placement.x / 100));
  const anchorY = Math.round(1792 * (placement.y / 100));
  const alpha = placement.opacity / 100;
  const alphaFilter = alpha < 1 ? `,colorchannelmixer=aa=${alpha.toFixed(2)}` : "";

  const base = ["[0:v]scale=1024:1792:force_original_aspect_ratio=increase,crop=1024:1792,setsar=1,format=rgba[bg]"];
  if (hasAvatarInput) {
    base.push(`[1:v]trim=duration=5,setpts=PTS-STARTPTS,fps=30,scale=${avatarWidth}:-2:force_original_aspect_ratio=decrease,chromakey=0x00FF00:0.18:0.08,format=rgba${alphaFilter}[avatar]`);
    base.push(`[bg][avatar]overlay=x=${anchorX}-w/2:y=${anchorY}-h:format=auto[base]`);
  } else {
    base.push("[bg]format=rgba[base]");
  }
  return [...base, buildCtaOverlayFilter(cta, { hasCtaBadgeInput, ctaInputIndex: hasAvatarInput ? 2 : 1 })].join(";");
}

function buildCtaOverlayFilter(cta, { hasCtaBadgeInput = false, ctaInputIndex = 2 } = {}) {
  if (!cta.enabled) return "[base]format=yuv420p[out]";
  const x = Math.round(1024 * (cta.x / 100));
  const y = Math.round(1792 * (cta.y / 100));
  const opacity = (cta.opacity / 100).toFixed(2);
  if (hasCtaBadgeInput && cta.mode === "badge" && cta.badge?.imageUrl) {
    const width = Math.round(320 * (cta.scale / 100));
    return `[${ctaInputIndex}:v]scale=${width}:-1:force_original_aspect_ratio=decrease,format=rgba,colorchannelmixer=aa=${opacity}[cta];[base][cta]overlay=x=${x}-w/2:y=${y}-h/2:enable='gte(t,3)',format=yuv420p[out]`;
  }
  const fontSize = Math.round(58 * (cta.scale / 100));
  const styleParts = [
    `[base]drawtext=text='${escapeFfmpegText(cta.text)}'`,
    `x=${x}-text_w/2`,
    `y=${y}-text_h/2`,
    `fontsize=${fontSize}`,
    `fontcolor=${getCtaTextColor(cta)}`,
    "borderw=3",
    "bordercolor=black@0.55"
  ];
  if (cta.mode === "badge") {
    styleParts.push("box=1", `boxcolor=${getCtaBoxColor(cta)}@${opacity}`, "boxborderw=28");
  }
  styleParts.push("enable='gte(t,3)'");
  return `${styleParts.join(":")},format=yuv420p[out]`;
}

function getCtaBadgeImageUrl(ctaOverlay = {}) {
  const cta = normalizeCtaOverlay(ctaOverlay);
  return cta.enabled && cta.mode === "badge" ? cta.badge?.imageUrl || "" : "";
}

function getCtaBoxColor(cta) {
  return toFfmpegColor(cta.badge?.background || cta.background, "white");
}

function getCtaTextColor(cta) {
  return toFfmpegColor(cta.badge?.color || cta.color, "black");
}

function toFfmpegColor(value, fallback) {
  const normalized = String(value || "").trim();
  if (/^#[0-9a-f]{6}$/i.test(normalized)) return normalized.replace("#", "0x");
  return fallback;
}

function escapeFfmpegText(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

function normalizeAvatarOverlay(payload = {}) {
  return {
    x: clampOverlayNumber(payload.x, 50, 15, 85),
    y: clampOverlayNumber(payload.y, 98, 45, 100),
    scale: clampOverlayNumber(payload.scale, 96, 35, 150),
    opacity: clampOverlayNumber(payload.opacity, 100, 30, 100)
  };
}

function clampOverlayNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
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
  return readFile(value);
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
