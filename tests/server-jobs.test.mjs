import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { IMAGE_PROMPT_MAX_CHARS } from "../src/domain/image-prompt-budget.js";
import { createServerJobsApiHandler, handleServerJobsApi } from "../scripts/server-jobs.mjs";

test("server job runs image generation, final assembly, avatar usage and disk upload", async () => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  const fetchCalls = [];
  globalThis.setTimeout = (callback) => originalSetTimeout(callback, 0);
  globalThis.fetch = async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : {};
    fetchCalls.push({ url: String(url), body });

    if (String(url).includes("/api/images/generate")) {
      assert.equal(body.provider, "gpt-image-2");
      assert.match(body.prompt, /ЖЕСТКИЙ ЯЗЫКОВОЙ КОНТРАКТ/);
      assert.match(body.prompt, /только на русском/);
      assert.match(body.prompt, /Generate a product scene/);
      return jsonResponse({ taskId: "image-task-server" });
    }
    if (String(url).includes("/api/images/status")) {
      return jsonResponse({ state: "success", imageUrl: "https://cdn.example.com/background.png" });
    }
    if (String(url).includes("/api/avatar-videos/composite")) {
      assert.equal(body.avatarVideoUrl, "https://cdn.example.com/avatar-warning.webm");
      assert.equal(body.backgroundImageUrl, "https://cdn.example.com/background.png");
      assert.equal(body.audioData, "data:audio/wav;base64,UklGRg==");
      assert.deepEqual(body.overlay, { x: 64, y: 92, scale: 40, opacity: 100 });
      return jsonResponse({ videoUrl: "/generated/avatar-videos/final-server.mp4", hasAudio: true });
    }
    if (String(url).includes("/api/yandex-disk/upload")) {
      assert.equal(body.fileUrl, "/generated/avatar-videos/final-server.mp4");
      assert.equal(body.targetFolder, "disk:/ВИДЕО/5сек/BBHERB/Test Avatar/Шиммер");
      assert.match(body.fileName, /serverjo\.mp4$/);
      return jsonResponse({
        diskPath: "disk:/ВИДЕО/5сек/BBHERB/Test Avatar/Шиммер/final-server.mp4",
        diskUrl: "https://disk.yandex.ru/i/final-server",
        diskVerifiedAt: "2026-07-22T10:00:00.000Z"
      });
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  try {
    const job = {
      id: "server-job-full",
      projectId: "project-1",
      productId: "product-1",
      status: "queued",
      stage: "idea",
      outputType: "final-video",
      prompt: "Generate a product scene",
      productName: "Шиммер",
      title: "Final server",
      avatarVideoId: "avatar-video-warning",
      avatarEmotionName: "тревожное предупреждение"
    };
    const project = {
      id: "project-1",
      name: "BBHERB",
      client: "Power Pro",
      yandexDiskFolder: "disk:/ВИДЕО/5сек/BBHERB",
      characters: [{
        id: "char-1",
        name: "Test Avatar",
        isActive: true,
        avatarVideos: [{
          id: "avatar-video-1",
          name: "спокойная экспертность",
          status: "ready",
          isActive: true,
          alphaVideoUrl: "https://cdn.example.com/avatar-alpha.webm",
          overlay: { x: 64, y: 92, scale: 40, opacity: 100 },
          ctaOverlay: { enabled: false }
        }, {
          id: "avatar-video-warning",
          name: "тревожное предупреждение",
          status: "ready",
          isActive: true,
          alphaVideoUrl: "https://cdn.example.com/avatar-warning.webm",
          overlay: { x: 64, y: 92, scale: 40, opacity: 100 },
          ctaOverlay: { enabled: false }
        }]
      }]
    };

    const started = await callServerJobsApi("POST", "/api/jobs/run", {
      job,
      context: {
        project,
        product: { id: "product-1", projectId: "project-1", name: "Шиммер после переименования" },
        selectedCharacterId: "char-1",
        selectedAudioId: "audio-1",
        audioLibrary: [{ id: "audio-1", title: "Beat", fileData: "data:audio/wav;base64,UklGRg==" }]
      }
    });
    assert.equal(started.status, 200);
    assert.equal(started.payload.job.status, "running");
    assert.match(started.payload.job.serverJobAcceptedAt, /^\d{4}-\d{2}-\d{2}T/);

    const finalPayload = await waitForServerJob("server-job-full", (payload) =>
      payload.job.status === "done" && payload.job.diskStatus === "done"
    );

    assert.equal(finalPayload.job.finalVideoUrl, "https://disk.yandex.ru/i/final-server");
    assert.equal(finalPayload.job.finalVideoHasAudio, true);
    assert.equal(finalPayload.job.diskPath, "disk:/ВИДЕО/5сек/BBHERB/Test Avatar/Шиммер/final-server.mp4");
    assert.equal(finalPayload.job.diskUrl, "https://disk.yandex.ru/i/final-server");
    assert.equal(finalPayload.job.diskVerifiedAt, "2026-07-22T10:00:00.000Z");
    assert.deepEqual(finalPayload.avatarUsage, {
      characterId: "char-1",
      videoId: "avatar-video-warning",
      nextIndex: 0,
      nextCharacterIndex: 0
    });
    assert.equal(fetchCalls.every((call) => call.url.startsWith("http://127.0.0.1:4173/")), true);
    assert.equal(fetchCalls.some((call) => call.url.includes("/api/avatar-videos/composite")), true);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
  }
});

test("server job persists image task id without waiting for browser polling", async () => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  const persisted = [];
  globalThis.setTimeout = (callback) => originalSetTimeout(callback, 0);
  globalThis.fetch = async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : {};
    if (String(url).includes("/api/images/generate")) {
      assert.equal(body.provider, "gpt-image-2");
      return jsonResponse({ taskId: "image-task-persisted" });
    }
    if (String(url).includes("/api/images/status")) {
      return jsonResponse({ state: "success", imageUrl: "https://cdn.example.com/no-browser.png" });
    }
    if (String(url).includes("/api/avatar-videos/composite")) {
      return jsonResponse({ videoUrl: "/generated/no-browser.mp4", hasAudio: false });
    }
    if (String(url).includes("/api/yandex-disk/upload")) {
      return jsonResponse({ diskPath: "disk:/no-browser.mp4" });
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  const handle = createServerJobsApiHandler({
    serverJobs: new Map(),
    persistServerJobSnapshot: async (job) => {
      persisted.push({ ...job });
      return true;
    }
  });

  try {
    const started = await callServerJobsApi("POST", "/api/jobs/run", {
      job: {
        id: "job-persist-task",
        projectId: "project-1",
        productId: "product-1",
        outputType: "final-video",
        prompt: "Persist task id"
      },
      context: { project: { id: "project-1", yandexDiskFolder: "" } }
    }, handle);

    assert.equal(started.status, 200);
    assert.match(started.payload.job.serverJobAcceptedAt, /^\d{4}-\d{2}-\d{2}T/);
    await waitFor(() => persisted.some((job) => job.imageTaskId === "image-task-persisted"));
    await waitFor(() => persisted.some((job) => job.status === "done"));
    assert.equal(persisted.some((job) => job.status === "done" && job.finalVideoUrl === "/generated/no-browser.mp4"), true);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
  }
});

test("server job renders final video without requiring a ready avatar video", async () => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  let compositeBody = null;
  globalThis.setTimeout = (callback) => originalSetTimeout(callback, 0);
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes("/api/images/generate")) return jsonResponse({ taskId: "image-task-no-avatar" });
    if (String(url).includes("/api/images/status")) {
      return jsonResponse({ state: "success", imageUrl: "https://cdn.example.com/no-avatar.png" });
    }
    if (String(url).includes("/api/avatar-videos/composite")) {
      compositeBody = JSON.parse(options.body || "{}");
      return jsonResponse({ videoUrl: "/generated/no-avatar.mp4", hasAudio: false });
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  const handle = createServerJobsApiHandler({
    serverJobs: new Map(),
    persistServerJobSnapshot: async () => true
  });

  try {
    await callServerJobsApi("POST", "/api/jobs/run", {
      job: {
        id: "job-no-avatar",
        projectId: "project-1",
        productId: "product-1",
        characterId: "char-no-ready-video",
        outputType: "final-video",
        prompt: "Render without avatar"
      },
      context: {
        selectedCharacterId: "char-no-ready-video",
        project: {
          id: "project-1",
          yandexDiskFolder: "",
          characters: [{ id: "char-no-ready-video", name: "No Video", avatarVideos: [] }]
        }
      }
    }, handle);

    const finalPayload = await waitForServerJob("job-no-avatar", (payload) => payload.job.status === "done", handle);
    assert.equal(finalPayload.job.renderedWithoutAvatar, true);
    assert.equal(finalPayload.job.finalVideoUrl, "/generated/no-avatar.mp4");
    assert.equal(compositeBody.avatarVideoUrl, "");
    assert.deepEqual(compositeBody.overlay, {});
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
  }
});

test("server job limits old overlong prompts before image generation request", async () => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  const overlongPrompt = [
    "GPT Image 2: создай вертикальную рекламную инфографику 9:16.",
    "ЯЗЫК НА ИЗОБРАЖЕНИИ: весь редакционный текст инфографики строго на русском языке.",
    "ИСКЛЮЧЕНИЕ ДЛЯ УПАКОВКИ: текст на реальной упаковке из product reference не переводить.",
    Array.from({ length: 900 }, () => "длинный старый контекст проекта").join(". "),
    "Заголовок: Важная тема.",
    "Подзаголовок: Короткое объяснение."
  ].join(" ");
  let imagePrompt = "";
  globalThis.setTimeout = (callback) => originalSetTimeout(callback, 0);
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes("/api/images/generate")) {
      imagePrompt = JSON.parse(options.body || "{}").prompt || "";
      return jsonResponse({ taskId: "image-task-limited-prompt" });
    }
    if (String(url).includes("/api/images/status")) {
      return jsonResponse({ state: "success", imageUrl: "https://cdn.example.com/limited-prompt.png" });
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  const handle = createServerJobsApiHandler({
    serverJobs: new Map(),
    persistServerJobSnapshot: async () => true
  });

  try {
    await callServerJobsApi("POST", "/api/jobs/run", {
      job: {
        id: "job-overlong-prompt",
        projectId: "project-1",
        productId: "product-1",
        outputType: "image",
        prompt: overlongPrompt
      },
      context: { project: { id: "project-1", yandexDiskFolder: "" } }
    }, handle);

    const payload = await waitForServerJob("job-overlong-prompt", (item) => item.job.status === "review", handle);
    assert.equal(payload.job.imageUrl, "https://cdn.example.com/limited-prompt.png");
    assert.ok(imagePrompt.length <= IMAGE_PROMPT_MAX_CHARS);
    assert.match(imagePrompt, /ЖЕСТКИЙ ЯЗЫКОВОЙ КОНТРАКТ/);
    assert.match(imagePrompt, /ЯЗЫК НА ИЗОБРАЖЕНИИ/);
    assert.match(imagePrompt, /Заголовок: Важная тема/);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
  }
});

test("missing in-memory server job is recovered from persisted state as retryable failure", async () => {
  const originalSetTimeout = globalThis.setTimeout;
  const persisted = [];
  globalThis.setTimeout = (callback) => originalSetTimeout(callback, 0);
  const handle = createServerJobsApiHandler({
    serverJobs: new Map(),
    loadPersistedServerJob: async () => ({
      id: "job-orphaned",
      status: "running",
      stage: "image",
      progress: 48,
      failMsg: "Сервер ожидает картинку..."
    }),
    persistServerJobSnapshot: async (job) => {
      persisted.push({ ...job });
      return true;
    }
  });

  try {
    const { status, payload } = await callServerJobsApi("GET", "/api/jobs/status?jobId=job-orphaned", null, handle);

    assert.equal(status, 200);
    assert.equal(payload.job.status, "running");
    assert.match(payload.job.failMsg, /восстановил/);
    const failed = await waitForServerJob("job-orphaned", (item) => item.job.status === "failed", handle);
    assert.match(failed.job.failMsg, /до создания задачи картинки/);
    assert.equal(persisted.at(-1).status, "failed");
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }
});

test("missing in-memory server job resumes persisted image task after restart", async () => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  const persisted = [];
  const fetchCalls = [];
  globalThis.setTimeout = (callback) => originalSetTimeout(callback, 0);
  globalThis.fetch = async (url) => {
    fetchCalls.push(String(url));
    if (String(url).includes("/api/images/status")) {
      return jsonResponse({ state: "success", imageUrl: "https://cdn.example.com/resumed.png" });
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  const handle = createServerJobsApiHandler({
    serverJobs: new Map(),
    loadPersistedServerJob: async () => ({
      id: "job-resume-image-task",
      status: "running",
      stage: "image",
      progress: 48,
      outputType: "image",
      imageProvider: "gpt-image-2",
      imageTaskId: "image-task-resume",
      failMsg: "Сервер ожидает картинку...",
      serverJobContext: { project: { id: "project-1" } }
    }),
    persistServerJobSnapshot: async (job) => {
      persisted.push({ ...job });
      return true;
    }
  });

  try {
    const { status, payload } = await callServerJobsApi("GET", "/api/jobs/status?jobId=job-resume-image-task", null, handle);

    assert.equal(status, 200);
    assert.equal(payload.job.status, "running");
    assert.equal(payload.job.serverJobContext, undefined);
    const resumed = await waitForServerJob("job-resume-image-task", (item) => item.job.status === "review", handle);
    assert.equal(resumed.job.imageUrl, "https://cdn.example.com/resumed.png");
    assert.equal(resumed.job.serverJobContext, undefined);
    assert.ok(fetchCalls.some((url) => url.includes("taskId=image-task-resume")));
    assert.equal(persisted.at(-1).status, "review");
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
  }
});

test("resumed final-video job restores project context for avatar and cta overlay", async () => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  const compositeBodies = [];
  globalThis.setTimeout = (callback) => originalSetTimeout(callback, 0);
  globalThis.fetch = async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : {};
    if (String(url).includes("/api/avatar-videos/composite")) {
      compositeBodies.push(body);
      return jsonResponse({ videoUrl: "/generated/avatar-videos/resumed-final.mp4", hasAudio: false });
    }
    if (String(url).includes("/api/yandex-disk/upload")) {
      return jsonResponse({ diskPath: "disk:/out/resumed-final.mp4" });
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  const handle = createServerJobsApiHandler({
    serverJobs: new Map(),
    loadPersistedServerJob: async () => ({
      id: "job-resume-final-video",
      projectId: "project-resume",
      characterId: "char-selected",
      status: "running",
      stage: "assembly",
      progress: 76,
      outputType: "final-video",
      imageUrl: "https://cdn.example.com/resumed-bg.png",
      failMsg: "Картинка готова, сервер собирает видео..."
    }),
    loadPersistedServerJobContext: async () => ({
      project: {
        id: "project-resume",
        name: "Resume Project",
        yandexDiskFolder: "disk:/out",
        ctaOverlay: { enabled: true, mode: "text", text: "ПОДПИШИСЬ", x: 50, y: 80, scale: 100, opacity: 100 },
        characters: [{
          id: "char-selected",
          name: "Selected Avatar",
          isActive: true,
          avatarVideos: [{
            id: "video-selected",
            status: "ready",
            isActive: true,
            alphaVideoUrl: "https://cdn.example.com/selected-alpha.webm",
            overlay: { x: 70, y: 100, scale: 40, opacity: 100 },
            ctaOverlay: { enabled: true, mode: "text", text: "ЖМИ", x: 50, y: 80, scale: 80, opacity: 100 }
          }]
        }]
      },
      selectedCharacterId: "char-selected",
      audioLibrary: []
    }),
    persistServerJobSnapshot: async () => true
  });

  try {
    await callServerJobsApi("GET", "/api/jobs/status?jobId=job-resume-final-video", null, handle);
    const final = await waitForServerJob("job-resume-final-video", (item) => item.job.status === "done", handle);

    assert.equal(final.job.renderedWithoutAvatar, false);
    assert.equal(final.job.finalVideoUrl, "/generated/avatar-videos/resumed-final.mp4");
    assert.equal(compositeBodies[0].avatarVideoUrl, "https://cdn.example.com/selected-alpha.webm");
    assert.equal(compositeBodies[0].ctaOverlay.text, "ЖМИ");
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
  }
});

async function waitForServerJob(jobId, predicate, handle = handleServerJobsApi) {
  for (let index = 0; index < 120; index += 1) {
    const { payload } = await callServerJobsApi("GET", `/api/jobs/status?jobId=${jobId}`, null, handle);
    if (predicate(payload)) return payload;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("server job did not finish");
}

async function callServerJobsApi(method, path, body, handle = handleServerJobsApi) {
  const request = Readable.from(body ? [JSON.stringify(body)] : []);
  request.method = method;
  request.headers = { host: "n8n-5sec.ap2dy7.easypanel.host" };
  const response = createJsonCaptureResponse();
  const handled = await handle(request, response, new URL(`http://127.0.0.1:4173${path}`));
  assert.equal(handled, true);
  return response.readJson();
}

async function waitFor(predicate) {
  for (let index = 0; index < 120; index += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("condition was not met");
}

function createJsonCaptureResponse() {
  const response = {
    status: 200,
    data: "",
    writeHead(status) {
      this.status = status;
    },
    end(data) {
      this.data = data || "";
    },
    readJson() {
      return { status: this.status, payload: this.data ? JSON.parse(this.data) : {} };
    }
  };
  return response;
}

function jsonResponse(payload, ok = true) {
  return {
    ok,
    json: async () => payload
  };
}
