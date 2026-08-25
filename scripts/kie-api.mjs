import { readFileSync } from "node:fs";
import { ensureRussianAvatarVideoPromptGuard, ensureRussianImagePromptGuard } from "../src/domain/language-policy.js";
import { resolveImageInputUrls, summarizeInputRefs } from "./reference-assets.mjs";
import { isS3AssetStorageConfigured, uploadRemoteAssetToS3 } from "./s3-assets.mjs";

const imageGenerationBodyLimitBytes = 20 * 1024 * 1024;

export async function handleKieApi(request, response, url) {
  try {
    if (request.method === "POST" && url.pathname === "/api/avatars/generate") {
      return await createAvatarTask(request, response);
    }

    if (request.method === "GET" && url.pathname === "/api/avatars/status") {
      return await getAvatarTask(response, url.searchParams.get("taskId"));
    }

    if (request.method === "POST" && url.pathname === "/api/images/generate") {
      return await createAvatarTask(request, response, { applyRussianImageGuard: true });
    }

    if (request.method === "GET" && url.pathname === "/api/images/status") {
      return await getAvatarTask(response, url.searchParams.get("taskId"));
    }

    if (request.method === "POST" && url.pathname === "/api/avatar-videos/generate") {
      return await createAvatarVideoTask(request, response);
    }

    if (request.method === "GET" && url.pathname === "/api/avatar-videos/status") {
      return await getAvatarVideoTask(response, url.searchParams.get("taskId"));
    }

    return false;
  } catch (error) {
    const status = error.code === "REQUEST_BODY_TOO_LARGE" ? 413 : 502;
    return sendJson(response, status, { error: error.message || "Kie.ai request failed" });
  }
}

export function loadEnvFile() {
  try {
    const text = readTextFile(".env");
    text.split(/\r?\n/).forEach((line) => {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
    });
  } catch {
    // Env files are optional; direct shell env still works.
  }
}

async function createAvatarTask(request, response, options = {}) {
  const token = process.env.KIE_API_KEY;
  if (!token) return sendJson(response, 500, { error: "KIE_API_KEY is not configured" });

  const body = await readJson(request);
  const prompt = options.applyRussianImageGuard ? ensureRussianImagePromptGuard(body.prompt) : body.prompt;
  if (!prompt) return sendJson(response, 400, { error: "prompt is required" });
  const rawInputUrls = Array.isArray(body.inputUrls) ? body.inputUrls.slice(0, 16) : [];
  let inputUrls = [];
  try {
    inputUrls = await resolveImageInputUrls(rawInputUrls, request);
  } catch (error) {
    return sendJson(response, 400, { error: error.message || "Не удалось подготовить reference images" });
  }
  const provider = body.provider === "nano-banana-2" ? "nano-banana-2" : "gpt-image-2";
  console.log("[kie:image:create]", JSON.stringify({
    provider,
    inputUrls: inputUrls.length,
    promptChars: String(prompt).length,
    ...summarizeInputRefs({ rawInputUrls, inputRefs: body.inputRefs, resolvedInputUrls: inputUrls })
  }));

  const result = await fetch(`${getBaseUrl()}/api/v1/jobs/createTask`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(createKieTaskPayload({ provider, prompt, inputUrls, body }))
  });

  const payload = await readUpstreamJson(result);
  if (!result.ok || payload.code !== 200) {
    const errorMessage = getKieErrorMessage(payload, "Kie.ai task creation failed");
    console.log("[kie:image:error]", JSON.stringify({ provider, status: result.status, message: errorMessage }));
    return sendJson(response, 502, { error: errorMessage, payload });
  }

  console.log("[kie:image:created]", JSON.stringify({ provider, taskId: payload.data?.taskId || "" }));
  return sendJson(response, 200, { taskId: payload.data?.taskId, provider, payload });
}

async function createAvatarVideoTask(request, response) {
  const token = process.env.KIE_API_KEY;
  if (!token) return sendJson(response, 500, { error: "KIE_API_KEY is not configured" });

  const body = await readJson(request);
  let imageUrls = [];
  try {
    imageUrls = await resolveImageInputUrls([body.imageUrl], request);
  } catch (error) {
    return sendJson(response, 400, { error: error.message || "Не удалось подготовить avatar reference image" });
  }
  if (!imageUrls.length) return sendJson(response, 400, { error: "avatar imageUrl is required" });
  if (!body.prompt) return sendJson(response, 400, { error: "prompt is required" });
  const prompt = ensureRussianAvatarVideoPromptGuard(body.prompt);
  console.log("[kie:avatar-video:create]", JSON.stringify({
    inputUrls: imageUrls.length,
    localAvatarRef: /^data:image\//i.test(String(body.imageUrl || "")),
    promptChars: String(prompt).length
  }));

  const result = await fetch(`${getBaseUrl()}/api/v1/jobs/createTask`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "kling-3.0/video",
      input: {
        prompt,
        image_urls: imageUrls,
        sound: false,
        duration: "5",
        aspect_ratio: "9:16",
        mode: "pro",
        multi_shots: false
      }
    })
  });

  const payload = await readUpstreamJson(result);
  if (!result.ok || payload.code !== 200) {
    const errorMessage = getKieErrorMessage(payload, "Kie.ai avatar video task creation failed");
    console.log("[kie:avatar-video:error]", JSON.stringify({ status: result.status, message: errorMessage }));
    return sendJson(response, 502, { error: errorMessage, payload });
  }

  console.log("[kie:avatar-video:created]", JSON.stringify({ taskId: payload.data?.taskId || "" }));
  return sendJson(response, 200, { taskId: payload.data?.taskId, provider: "kie.ai", model: "kling-3.0/video", payload });
}

function createKieTaskPayload({ provider, prompt, inputUrls, body }) {
  if (provider === "nano-banana-2") {
    return {
      model: "nano-banana-2",
      input: {
        prompt,
        ...(inputUrls.length ? { image_input: inputUrls } : {}),
        aspect_ratio: body.aspectRatio || "9:16",
        resolution: body.resolution || "1K",
        output_format: body.outputFormat || "png"
      }
    };
  }
  return {
    model: inputUrls.length ? "gpt-image-2-image-to-image" : "gpt-image-2-text-to-image",
    input: {
      prompt,
      ...(inputUrls.length ? { input_urls: inputUrls } : {}),
      aspect_ratio: body.aspectRatio || "9:16",
      resolution: body.resolution || "1K"
    }
  };
}

async function getAvatarTask(response, taskId) {
  const token = process.env.KIE_API_KEY;
  if (!token) return sendJson(response, 500, { error: "KIE_API_KEY is not configured" });
  if (!taskId) return sendJson(response, 400, { error: "taskId is required" });

  const result = await fetch(`${getBaseUrl()}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const payload = await readUpstreamJson(result);
  if (!result.ok) return sendJson(response, 502, { error: getKieErrorMessage(payload, "Kie.ai status request failed"), payload });

  const data = payload.data || {};
  const resultJson = parseResultJson(data.resultJson);
  const imageAsset = await persistKieAsset(getKieImageUrl(data, resultJson), { prefix: "avatars", fallbackExt: ".png" });
  return sendJson(response, 200, {
    taskId,
    state: imageAsset.error ? "failed" : data.state,
    progress: data.progress || 0,
    imageUrl: imageAsset.url,
    failMsg: imageAsset.error || data.failMsg || "",
    payload
  });
}

async function getAvatarVideoTask(response, taskId) {
  const token = process.env.KIE_API_KEY;
  if (!token) return sendJson(response, 500, { error: "KIE_API_KEY is not configured" });
  if (!taskId) return sendJson(response, 400, { error: "taskId is required" });

  const result = await fetch(`${getBaseUrl()}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const payload = await readUpstreamJson(result);
  if (!result.ok) return sendJson(response, 502, { error: getKieErrorMessage(payload, "Kie.ai avatar video status request failed"), payload });

  const data = payload.data || {};
  const resultJson = parseResultJson(data.resultJson);
  const responseJson = parseResultJson(data.response);
  const videoAsset = await persistKieAsset(getKieVideoUrl(data, resultJson, responseJson), { prefix: "avatar-videos", fallbackExt: ".mp4" });
  return sendJson(response, 200, {
    taskId,
    state: videoAsset.error ? "failed" : data.state,
    progress: data.progress || 0,
    videoUrl: videoAsset.url,
    failMsg: videoAsset.error || data.failMsg || data.errorMessage || "",
    payload
  });
}

async function persistKieAsset(url, options) {
  if (!url || !isS3AssetStorageConfigured()) return { url, error: "" };
  try {
    return { url: await uploadRemoteAssetToS3(url, options), error: "" };
  } catch (error) {
    console.log("[s3:asset:error]", JSON.stringify({ url: url.slice(0, 80), message: error.message || "" }));
    return { url: "", error: error.message || "Не удалось сохранить asset в S3" };
  }
}

function getKieImageUrl(data, resultJson) {
  return resultJson.resultUrls?.[0]
    || resultJson.result_urls?.[0]
    || resultJson.images?.[0]
    || resultJson.urls?.[0]
    || resultJson.url
    || data.imageUrl
    || "";
}

function getKieVideoUrl(data, resultJson, responseJson) {
  return resultJson.resultUrls?.[0]
    || resultJson.result_urls?.[0]
    || resultJson.video_urls?.[0]
    || resultJson.videos?.[0]
    || resultJson.url
    || responseJson.resultUrls?.[0]
    || responseJson.result_urls?.[0]
    || responseJson.video_urls?.[0]
    || responseJson.videos?.[0]
    || responseJson.url
    || data.videoUrl
    || "";
}

function getBaseUrl() {
  return process.env.KIE_BASE_URL || "https://api.kie.ai";
}

function isRemoteUrl(value) {
  return /^https?:\/\//.test(String(value || ""));
}

function parseResultJson(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

async function readUpstreamJson(response) {
  const raw = await response.text().catch(() => "");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { error: raw.trim() || "Kie.ai вернул некорректный JSON." };
  }
}

function getKieErrorMessage(payload, fallback) {
  return payload.msg || payload.error?.message || payload.error || fallback;
}

function readJson(request) {
  return readJsonRequest(request, { limitBytes: imageGenerationBodyLimitBytes, tooLargeMessage: "Image generation request is too large" });
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
  return true;
}

function readTextFile(path) {
  return readFileSync(path, "utf8");
}
import { readJsonRequest } from "./request-body.mjs";
