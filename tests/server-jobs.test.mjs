import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
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
      assert.equal(body.prompt, "Generate a product scene");
      return jsonResponse({ taskId: "image-task-server" });
    }
    if (String(url).includes("/api/images/status")) {
      return jsonResponse({ state: "success", imageUrl: "https://cdn.example.com/background.png" });
    }
    if (String(url).includes("/api/avatar-videos/composite")) {
      assert.equal(body.avatarVideoUrl, "https://cdn.example.com/avatar-alpha.webm");
      assert.equal(body.backgroundImageUrl, "https://cdn.example.com/background.png");
      assert.equal(body.audioData, "data:audio/wav;base64,UklGRg==");
      assert.deepEqual(body.overlay, { x: 64, y: 92, scale: 40, opacity: 100 });
      return jsonResponse({ videoUrl: "/generated/avatar-videos/final-server.mp4", hasAudio: true });
    }
    if (String(url).includes("/api/yandex-disk/upload")) {
      assert.equal(body.fileUrl, "/generated/avatar-videos/final-server.mp4");
      assert.equal(body.targetFolder, "disk:/ВИДЕО/5сек/Test Avatar");
      return jsonResponse({ diskPath: "disk:/ВИДЕО/5сек/Test Avatar/final-server.mp4" });
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
      title: "Final server"
    };
    const project = {
      id: "project-1",
      name: "Project",
      yandexDiskFolder: "disk:/ВИДЕО/5сек",
      characters: [{
        id: "char-1",
        name: "Test Avatar",
        isActive: true,
        avatarVideos: [{
          id: "avatar-video-1",
          status: "ready",
          isActive: true,
          alphaVideoUrl: "https://cdn.example.com/avatar-alpha.webm",
          overlay: { x: 64, y: 92, scale: 40, opacity: 100 },
          ctaOverlay: { enabled: false }
        }]
      }]
    };

    const started = await callServerJobsApi("POST", "/api/jobs/run", {
      job,
      context: {
        project,
        selectedCharacterId: "char-1",
        selectedAudioId: "audio-1",
        audioLibrary: [{ id: "audio-1", title: "Beat", fileData: "data:audio/wav;base64,UklGRg==" }]
      }
    });
    assert.equal(started.status, 200);
    assert.equal(started.payload.job.status, "running");

    const finalPayload = await waitForServerJob("server-job-full", (payload) =>
      payload.job.status === "done" && payload.job.diskStatus === "done"
    );

    assert.equal(finalPayload.job.finalVideoUrl, "/generated/avatar-videos/final-server.mp4");
    assert.equal(finalPayload.job.finalVideoHasAudio, true);
    assert.equal(finalPayload.job.diskPath, "disk:/ВИДЕО/5сек/Test Avatar/final-server.mp4");
    assert.deepEqual(finalPayload.avatarUsage, {
      characterId: "char-1",
      videoId: "avatar-video-1",
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

test("missing in-memory server job is recovered from persisted state as retryable failure", async () => {
  const persisted = [];
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

  const { status, payload } = await callServerJobsApi("GET", "/api/jobs/status?jobId=job-orphaned", null, handle);

  assert.equal(status, 200);
  assert.equal(payload.job.status, "failed");
  assert.match(payload.job.failMsg, /перезапуском/);
  assert.equal(persisted[0].status, "failed");
});

async function waitForServerJob(jobId, predicate, handle = handleServerJobsApi) {
  for (let index = 0; index < 30; index += 1) {
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
  for (let index = 0; index < 30; index += 1) {
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
