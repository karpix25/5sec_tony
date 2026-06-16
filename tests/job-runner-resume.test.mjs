import test from "node:test";
import assert from "node:assert/strict";
import { projects, products } from "../src/domain/entities.js";
import { runImageJob, resumeRunningImageJobs } from "../src/ui/job-runner.js";

test("image polling resumes for running jobs after page reload", async () => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  const job = {
    id: "job-resume",
    status: "running",
    stage: "image",
    progress: 44,
    imageTaskId: "task-resume",
    imageProvider: "gpt-image-2",
    outputType: "image",
    failMsg: ""
  };
  const store = {
    getState: () => ({ jobs: [job] }),
    patchJob: (jobId, payload) => {
      if (jobId === job.id) Object.assign(job, payload);
    }
  };

  globalThis.setTimeout = (callback) => originalSetTimeout(callback, 0);
  globalThis.fetch = async (url) => {
    assert.match(String(url), /task-resume/);
    return {
      ok: true,
      json: async () => ({ state: "success", imageUrl: "https://cdn.example.com/result.png" })
    };
  };

  await resumeRunningImageJobs(store);

  assert.equal(job.status, "review");
  assert.equal(job.stage, "approval");
  assert.equal(job.imageUrl, "https://cdn.example.com/result.png");

  globalThis.fetch = originalFetch;
  globalThis.setTimeout = originalSetTimeout;
});

test("image polling keeps the same task after a transient API disconnect", async () => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  const job = {
    id: "job-transient-status",
    status: "running",
    stage: "image",
    progress: 44,
    imageTaskId: "task-transient",
    imageProvider: "gpt-image-2",
    outputType: "image",
    failMsg: ""
  };
  const store = {
    getState: () => ({ jobs: [job] }),
    patchJob: (jobId, payload) => {
      if (jobId === job.id) Object.assign(job, payload);
    }
  };
  let statusCalls = 0;

  globalThis.window = { location: { origin: "https://n8n-5sec.ap2dy7.easypanel.host" } };
  globalThis.setTimeout = (callback) => originalSetTimeout(callback, 0);
  globalThis.fetch = async (url) => {
    assert.match(String(url), /task-transient/);
    statusCalls += 1;
    if (statusCalls === 1) throw new TypeError("Failed to fetch");
    return {
      ok: true,
      json: async () => ({ state: "success", imageUrl: "https://cdn.example.com/transient-result.png" })
    };
  };

  try {
    await resumeRunningImageJobs(store);
    await waitFor(() => job.status === "review");

    assert.equal(statusCalls, 2);
    assert.equal(job.stage, "approval");
    assert.equal(job.imageUrl, "https://cdn.example.com/transient-result.png");
    assert.equal(job.imageProvider, "gpt-image-2");
  } finally {
    delete globalThis.window;
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
  }
});

test("running jobs without task id fail instead of hanging after reload", async () => {
  const job = {
    id: "job-stale",
    status: "running",
    stage: "image",
    progress: 44,
    failMsg: ""
  };
  const store = {
    getState: () => ({ jobs: [job] }),
    patchJob: (jobId, payload) => {
      if (jobId === job.id) Object.assign(job, payload);
    }
  };

  await resumeRunningImageJobs(store);

  assert.equal(job.status, "failed");
  assert.equal(job.progress, 100);
  assert.match(job.failMsg, /прервана обновлением страницы/);
});

test("image job uses its own product data instead of currently selected product", async () => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  const project = projects.find((item) => item.id === "supplements");
  const jobProduct = products.find((item) => item.id === "collagen");
  const selectedProduct = products.find((item) => item.id === "magnesium");
  const job = {
    id: "job-product-context",
    projectId: project.id,
    productId: jobProduct.id,
    status: "queued",
    stage: "idea",
    progress: 6,
    outputType: "image",
    referenceTitle: project.references[0].title,
    diversitySlot: { id: "slot", topic: "уход изнутри", hook: "Почему уход не работает", format: "checklist" }
  };
  const state = {
    projects: [project],
    products: [selectedProduct, jobProduct],
    jobs: [job],
    selectedProjectId: project.id,
    selectedProductId: selectedProduct.id,
    selectedReferenceId: project.references[0].id,
    selectedCharacterId: project.characters[0].id,
    selectedAudioId: "",
    audioLibrary: []
  };
  const seenProducts = [];
  const store = {
    getState: () => state,
    patchJob: (jobId, payload) => {
      const target = state.jobs.find((item) => item.id === jobId);
      if (target) Object.assign(target, payload);
    },
    replaceJob: (jobId, jobNext) => {
      state.jobs = state.jobs.map((item) => (item.id === jobId ? jobNext : item));
    }
  };

  globalThis.setTimeout = (callback) => originalSetTimeout(callback, 0);
  globalThis.fetch = async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : {};
    if (String(url).includes("/api/generation/brief")) {
      seenProducts.push(body.product?.id);
      return { ok: true, json: async () => ({ draft: { plan: { points: ["пункт"] } } }) };
    }
    if (String(url).includes("/api/generation/humanize")) {
      seenProducts.push(body.product?.id);
      return { ok: true, json: async () => ({ draft: { points: ["пункт"] } }) };
    }
    if (String(url).includes("/api/images/generate")) {
      assert.match(body.prompt, new RegExp(jobProduct.name));
      assert.doesNotMatch(body.prompt, new RegExp(`Продукт: ${selectedProduct.name}`));
      return { ok: true, json: async () => ({ taskId: "task-context" }) };
    }
    return { ok: true, json: async () => ({ state: "success", imageUrl: "https://cdn.example.com/context.png" }) };
  };

  await runImageJob(store, job.id);

  assert.deepEqual(seenProducts, [jobProduct.id, jobProduct.id]);

  globalThis.fetch = originalFetch;
  globalThis.setTimeout = originalSetTimeout;
});

test("image job assembles final 5 second video with reusable avatar video and library audio", async () => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  const project = {
    ...projects.find((item) => item.id === "supplements"),
    characters: [{
      id: "char-other",
      name: "Other Avatar",
      status: "approved",
      imageData: "https://cdn.example.com/other-avatar.png",
      avatarVideos: [{
        id: "avatar-video-other",
        status: "ready",
        videoUrl: "https://cdn.example.com/other-avatar-green.mp4",
        alphaVideoUrl: "https://cdn.example.com/other-avatar-alpha.webm",
        overlay: { x: 20, y: 60, scale: 140, opacity: 50 }
      }]
    }, {
      id: "char-ready",
      name: "Ready Avatar",
      status: "approved",
      imageData: "https://cdn.example.com/avatar.png",
      avatarVideos: [{
        id: "avatar-video-ready",
        status: "ready",
        videoUrl: "https://cdn.example.com/avatar-green.mp4",
        alphaVideoUrl: "https://cdn.example.com/avatar-alpha.webm",
        overlay: { x: 68, y: 95, scale: 82, opacity: 75 }
      }]
    }]
  };
  const product = products.find((item) => item.id === "magnesium");
  const audio = {
    id: "audio-ready",
    title: "Library beat",
    fileData: "data:audio/wav;base64,UklGRg=="
  };
  const job = {
    id: "job-final-video",
    projectId: project.id,
    productId: product.id,
    status: "queued",
    stage: "idea",
    progress: 6,
    outputType: "final-video",
    characterId: "char-ready",
    referenceTitle: project.references[0].title
  };
  const state = {
    projects: [project],
    products: [product],
    jobs: [job],
    selectedProjectId: project.id,
    selectedProductId: product.id,
    selectedReferenceId: project.references[0].id,
    selectedCharacterId: "char-other",
    selectedAudioId: audio.id,
    audioLibrary: [audio]
  };
  let markedVideo = null;
  const store = {
    getState: () => state,
    patchJob: (jobId, payload) => {
      const target = state.jobs.find((item) => item.id === jobId);
      if (target) Object.assign(target, payload);
    },
    replaceJob: (jobId, jobNext) => {
      state.jobs = state.jobs.map((item) => (item.id === jobId ? jobNext : item));
    },
    markAvatarVideoUsed: (characterId, videoId, nextIndex) => {
      markedVideo = { characterId, videoId, nextIndex };
    }
  };

  globalThis.setTimeout = (callback) => originalSetTimeout(callback, 0);
  globalThis.fetch = async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : {};
    if (String(url).includes("/api/generation/brief")) {
      return { ok: true, json: async () => ({ draft: { hook: "Готовый ролик", plan: { points: ["пункт"] } } }) };
    }
    if (String(url).includes("/api/generation/humanize")) {
      return { ok: true, json: async () => ({ draft: { points: ["пункт"] } }) };
    }
    if (String(url).includes("/api/images/generate")) {
      return { ok: true, json: async () => ({ taskId: "task-final-video-image" }) };
    }
    if (String(url).includes("/api/images/status")) {
      return { ok: true, json: async () => ({ state: "success", imageUrl: "https://cdn.example.com/background.png" }) };
    }
    if (String(url).includes("/api/avatar-videos/composite")) {
      assert.equal(body.avatarVideoUrl, "https://cdn.example.com/avatar-alpha.webm");
      assert.equal(body.backgroundImageUrl, "https://cdn.example.com/background.png");
      assert.equal(body.audioData, audio.fileData);
      assert.deepEqual(body.overlay, { x: 68, y: 95, scale: 82, opacity: 75 });
      return { ok: true, json: async () => ({ videoUrl: "/generated/avatar-videos/final-with-audio.mp4", hasAudio: true }) };
    }
    return { ok: true, json: async () => ({}) };
  };

  try {
    await runImageJob(store, job.id);
    await waitFor(() => Boolean(state.jobs[0].finalVideoUrl));

    assert.equal(state.jobs[0].finalVideoUrl, "/generated/avatar-videos/final-with-audio.mp4");
    assert.equal(state.jobs[0].finalVideoHasAudio, true);
    assert.equal(state.jobs[0].stage, "export");
    assert.equal(state.jobs[0].status, "done");
    assert.deepEqual(markedVideo, { characterId: "char-ready", videoId: "avatar-video-ready", nextIndex: 0 });
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
  }
});

test("final video job fails clearly when reusable avatar video is missing", async () => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  const project = projects.find((item) => item.id === "supplements");
  const product = products.find((item) => item.id === "magnesium");
  const job = {
    id: "job-missing-avatar-video",
    projectId: project.id,
    productId: product.id,
    status: "queued",
    stage: "idea",
    progress: 6,
    outputType: "final-video",
    referenceTitle: project.references[0].title
  };
  const state = {
    projects: [project],
    products: [product],
    jobs: [job],
    selectedProjectId: project.id,
    selectedProductId: product.id,
    selectedReferenceId: project.references[0].id,
    selectedCharacterId: project.characters[0].id,
    selectedAudioId: "",
    audioLibrary: []
  };
  const store = {
    getState: () => state,
    patchJob: (jobId, payload) => {
      const target = state.jobs.find((item) => item.id === jobId);
      if (target) Object.assign(target, payload);
    },
    replaceJob: (jobId, jobNext) => {
      state.jobs = state.jobs.map((item) => (item.id === jobId ? jobNext : item));
    }
  };

  globalThis.setTimeout = (callback) => originalSetTimeout(callback, 0);
  globalThis.fetch = async (url) => {
    if (String(url).includes("/api/generation/brief")) {
      return { ok: true, json: async () => ({ draft: { hook: "Готовый ролик", plan: { points: ["пункт"] } } }) };
    }
    if (String(url).includes("/api/generation/humanize")) {
      return { ok: true, json: async () => ({ draft: { points: ["пункт"] } }) };
    }
    if (String(url).includes("/api/images/generate")) {
      return { ok: true, json: async () => ({ taskId: "task-missing-avatar-video" }) };
    }
    if (String(url).includes("/api/images/status")) {
      return { ok: true, json: async () => ({ state: "success", imageUrl: "https://cdn.example.com/background.png" }) };
    }
    return { ok: true, json: async () => ({}) };
  };

  try {
    await runImageJob(store, job.id);
    await waitFor(() => state.jobs[0].status === "failed");

    assert.equal(state.jobs[0].stage, "assembly");
    assert.equal(state.jobs[0].progress, 100);
    assert.match(state.jobs[0].failMsg, /аватар-видео/);
    assert.equal(state.jobs[0].finalVideoUrl, "");
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
  }
});

async function waitFor(predicate) {
  for (let index = 0; index < 25; index += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("condition was not met");
}
