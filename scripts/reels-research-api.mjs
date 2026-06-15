import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const scrapeBaseUrl = "https://api.scrapecreators.com";
const openRouterUrl = "https://openrouter.ai/api/v1/chat/completions";
const visionModel = "qwen/qwen3.5-9b";
const writingModel = "google/gemini-3.1-flash-lite";

export async function handleReelsResearchApi(request, response, url) {
  if (request.method === "POST" && url.pathname === "/api/reels/research") {
    return analyzeReelsResearch(request, response);
  }
  return false;
}

async function analyzeReelsResearch(request, response) {
  try {
    const body = await readJson(request);
    const scrapeKey = process.env.SCRAPECREATORS_KEY;
    const openRouterKey = process.env.OPENROUTER_API_KEY;
    if (!scrapeKey) return sendJson(response, 500, { error: "SCRAPECREATORS_KEY is not configured" });
    if (!openRouterKey) return sendJson(response, 500, { error: "OPENROUTER_API_KEY is not configured" });

    const handles = normalizeHandles(body.accounts);
    const limit = Math.max(1, Math.min(Number(body.limit || 10), 10));
    const { reels, errors } = await collectReels(scrapeKey, handles, limit);
    if (!reels.length) return sendJson(response, 502, { error: "Не удалось получить публичные Reels", errors });
    const groups = chunk(reels, 5);
    const analyzedGroups = [];

    for (const group of groups) {
      analyzedGroups.push(...await analyzeReelGroup(openRouterKey, group));
    }

    const summary = await summarizePatterns(openRouterKey, analyzedGroups);
    return sendJson(response, 200, {
      modelAnalysis: visionModel,
      modelWriting: writingModel,
      accounts: handles,
      errors,
      videos: analyzedGroups,
      summary
    });
  } catch (error) {
    return sendJson(response, 502, { error: error.message || "Reels research failed" });
  }
}

async function collectReels(apiKey, handles, limit) {
  const reels = [];
  const errors = [];
  for (const handle of handles) {
    let feed = null;
    try {
      feed = await scrapeJson(apiKey, "/v1/instagram/user/reels", { handle, trim: "false" });
    } catch (error) {
      errors.push({ account: handle, error: error.message || "Не удалось получить Reels" });
      continue;
    }
    const items = (feed.items || feed.data || feed.reels || []).slice(0, limit);
    const accountReels = await mapLimit(items, 3, async (item, index) => {
      const media = item.media || item;
      const code = media.code || media.shortcode || media.pk || media.id;
      const url = code ? `https://www.instagram.com/reel/${code}/` : media.url || "";
      const videoUrl = getVideoUrl(media);
      const transcript = url ? await getTranscript(apiKey, url) : "";
      const frame = await getFrameDataUrl(videoUrl, getThumbnailUrl(media));
      return {
        id: String(media.id || code || `${handle}-${index}`),
        account: handle,
        index: index + 1,
        url,
        caption: media.caption?.text || media.caption || "",
        transcript,
        metrics: {
          plays: media.play_count || media.view_count || media.video_view_count || "",
          likes: media.like_count || media.likes || "",
          comments: media.comment_count || media.comments || ""
        },
        frame
      };
    });
    reels.push(...accountReels);
  }
  return { reels, errors };
}

async function scrapeJson(apiKey, path, params) {
  const url = new URL(path, scrapeBaseUrl);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") url.searchParams.set(key, value);
  });
  const result = await fetchWithTimeout(url, { headers: { "x-api-key": apiKey } }, 45000);
  const payload = await result.json().catch(() => ({}));
  if (!result.ok) throw new Error(payload.message || payload.error || `ScrapeCreators ${path} failed`);
  return payload;
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function getTranscript(apiKey, url) {
  try {
    const payload = await scrapeJson(apiKey, "/v2/instagram/media/transcript", { url });
    return (payload.transcripts || []).map((item) => item.text).filter(Boolean).join("\n");
  } catch {
    return "";
  }
}

async function getFrameDataUrl(videoUrl, fallbackImageUrl) {
  if (!videoUrl) return fallbackImageUrl ? await imageUrlToDataUrl(fallbackImageUrl) : "";
  const dir = mkdtempSync(join(tmpdir(), "anton-reel-"));
  const videoPath = join(dir, "video.mp4");
  const framePath = join(dir, "frame.jpg");
  try {
    const video = await fetch(videoUrl);
    if (!video.ok) throw new Error("Video download failed");
    writeFileSync(videoPath, Buffer.from(await video.arrayBuffer()));
    await execFileAsync("ffmpeg", ["-y", "-ss", "1", "-i", videoPath, "-frames:v", "1", "-vf", "scale=360:-1", "-q:v", "6", framePath], { timeout: 30000 });
    return `data:image/jpeg;base64,${readFileSync(framePath).toString("base64")}`;
  } catch {
    return fallbackImageUrl ? await imageUrlToDataUrl(fallbackImageUrl) : "";
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function imageUrlToDataUrl(url) {
  try {
    const image = await fetch(url);
    if (!image.ok) return "";
    const bytes = Buffer.from(await image.arrayBuffer());
    const contentType = image.headers.get("content-type") || "image/jpeg";
    return `data:${contentType};base64,${bytes.toString("base64")}`;
  } catch {
    return "";
  }
}

async function analyzeReelGroup(token, reels) {
  const content = [
    { type: "text", text: reelGroupInstruction(reels) },
    ...reels.filter((reel) => reel.frame).map((reel) => ({
      type: "image_url",
      image_url: { url: reel.frame }
    }))
  ];
  const text = await callOpenRouter(token, visionModel, [{ role: "user", content }], 0.2);
  const parsed = parseJsonDraft(text);
  return normalizeAnalyzedVideos(reels, parsed.videos || parsed.items || []);
}

async function summarizePatterns(token, videos) {
  const text = await callOpenRouter(token, writingModel, [
    { role: "system", content: "Ты creative strategist для Reels-инфографик. Пиши по-русски. Возвращай только JSON." },
    { role: "user", content: summaryInstruction(videos) }
  ], 0.3);
  return parseJsonDraft(text);
}

async function callOpenRouter(token, model, messages, temperature) {
  const result = await fetch(openRouterUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://127.0.0.1:4173",
      "X-Title": "Anton 5 sec Studio"
    },
    body: JSON.stringify({ model, messages, temperature })
  });
  const payload = await result.json().catch(() => ({}));
  if (!result.ok) throw new Error(payload.error?.message || "OpenRouter request failed");
  return payload.choices?.[0]?.message?.content || "";
}

function reelGroupInstruction(reels) {
  return JSON.stringify({
    task: "Проанализируй каждый Instagram Reel по кадру с 1-й секунды, подписи и транскрипту. Вытащи тему, хук и сценарный паттерн.",
    rules: [
      "Пиши по-русски.",
      "Если кадр не раскрывает смысл, опирайся на caption/transcript.",
      "Не копируй дословно чужие тексты; формулируй как паттерн.",
      "Отдельно отметь визуальный прием: фон, персонаж, объект, текстовая иерархия, плотность, цветовой акцент."
    ],
    output: {
      videos: [{
        id: "id из входа",
        account: "account",
        index: "index из входа",
        topic: "тема видео",
        hook: "главный хук или реконструкция хука",
        pain: "широкая боль аудитории",
        scenarioPattern: "структура сценария",
        visualPattern: "визуальная механика кадра",
        reusableTemplate: "как это можно переиспользовать для других проектов"
      }]
    },
    videos: reels.map(({ id, account, index, caption, transcript, metrics, url }) => ({
      id,
      account,
      index,
      caption,
      transcript,
      metrics,
      url
    }))
  });
}

function summaryInstruction(videos) {
  return JSON.stringify({
    task: "Синтезируй паттерны из анализа Reels. Нужны темы, хуки и сценарные правила для нашего генератора инфографик.",
    output: {
      hookPatterns: ["механики хуков с формулой"],
      scenarioPatterns: ["структуры сценариев"],
      visualPatterns: ["визуальные приемы инфографик"],
      topicAngles: ["углы тем, которые можно ротировать"],
      generatorRules: ["правила, которые стоит встроить в генератор"],
      reusableHooks: ["10 универсальных русских шаблонов хуков"]
    },
    videos
  });
}

function normalizeAnalyzedVideos(reels, analyzed) {
  return reels.map((reel, index) => {
    const match = analyzed.find((item) => String(item.id) === reel.id)
      || analyzed.find((item) => item.account === reel.account && Number(item.index) === reel.index)
      || analyzed[index]
      || {};
    return {
      ...reel,
      frame: reel.frame,
      topic: match.topic || "Тема требует ручной проверки",
      hook: match.hook || firstSentence(reel.caption || reel.transcript),
      pain: match.pain || "",
      scenarioPattern: match.scenarioPattern || "",
      visualPattern: match.visualPattern || "",
      reusableTemplate: match.reusableTemplate || ""
    };
  });
}

function getVideoUrl(item) {
  return item.video_versions?.[0]?.url
    || item.video?.url_list?.[0]
    || item.video_url
    || findFirstUrl(item, (url) => /\.mp4(\?|$)/.test(url) || url.includes("/video/"));
}

function getThumbnailUrl(item) {
  return item.image_versions2?.candidates?.[0]?.url
    || item.thumbnail_url
    || item.display_url
    || item.video?.cover?.url_list?.[0]
    || findFirstUrl(item, (url) => /\.(jpg|jpeg|png|webp|heic)(\?|$)/i.test(url));
}

function findFirstUrl(value, predicate) {
  if (typeof value === "string" && value.startsWith("http") && predicate(value)) return value;
  if (!value || typeof value !== "object") return "";
  for (const child of Object.values(value)) {
    const found = Array.isArray(child)
      ? child.map((item) => findFirstUrl(item, predicate)).find(Boolean)
      : findFirstUrl(child, predicate);
    if (found) return found;
  }
  return "";
}

function normalizeHandles(value) {
  const fallback = ["bodyhealth.labs", "thehealthymail", "finsoroka", "motivate.wise"];
  const handles = Array.isArray(value) ? value : String(value || "").split(/\s|,|\n/);
  const normalized = handles.map((item) => String(item).replace(/^@/, "").trim()).filter(Boolean).slice(0, 8);
  return normalized.length ? normalized : fallback;
}

function chunk(items, size) {
  const groups = [];
  for (let index = 0; index < items.length; index += size) groups.push(items.slice(index, index + size));
  return groups;
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

function firstSentence(value) {
  return String(value || "").split(/[.!?\n]/)[0].trim();
}

function parseJsonDraft(text) {
  const json = String(text).match(/\{[\s\S]*\}/)?.[0] || "{}";
  try {
    return JSON.parse(json);
  } catch {
    return {};
  }
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
