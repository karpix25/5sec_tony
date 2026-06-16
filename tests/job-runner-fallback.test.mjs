import test from "node:test";
import assert from "node:assert/strict";
import { projects, products } from "../src/domain/entities.js";
import { runImageJob, resumeRunningImageJobs } from "../src/ui/job-runner.js";

test("resume waits for store hydration before scanning running jobs", async () => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  const job = {
    id: "job-hydrated",
    status: "running",
    stage: "image",
    progress: 44,
    imageTaskId: "task-hydrated",
    imageProvider: "gpt-image-2",
    outputType: "image",
    failMsg: ""
  };
  let releaseHydration;
  const store = {
    whenHydrated: () => new Promise((resolve) => { releaseHydration = resolve; }),
    getState: () => ({ jobs: [job] }),
    patchJob: (jobId, payload) => {
      if (jobId === job.id) Object.assign(job, payload);
    }
  };
  let fetchCalled = false;

  globalThis.setTimeout = (callback) => originalSetTimeout(callback, 0);
  globalThis.fetch = async () => {
    fetchCalled = true;
    return { ok: true, json: async () => ({ state: "success", imageUrl: "https://cdn.example.com/hydrated.png" }) };
  };

  try {
    const pending = resumeRunningImageJobs(store);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(fetchCalled, false);

    releaseHydration();
    await pending;
    await waitFor(() => job.status === "review");

    assert.equal(fetchCalled, true);
    assert.equal(job.imageUrl, "https://cdn.example.com/hydrated.png");
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
  }
});

test("image job falls back to local generation when AI brief request fails", async () => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  const project = projects.find((item) => item.id === "supplements");
  const product = products.find((item) => item.id === "magnesium");
  const job = {
    id: "job-local-fallback",
    projectId: project.id,
    productId: product.id,
    status: "queued",
    stage: "idea",
    progress: 6,
    outputType: "image",
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
  let generatedPrompt = "";

  globalThis.setTimeout = (callback) => originalSetTimeout(callback, 0);
  globalThis.fetch = async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : {};
    if (String(url).includes("/api/generation/brief")) {
      return { ok: false, text: async () => "brief unavailable" };
    }
    if (String(url).includes("/api/images/generate")) {
      generatedPrompt = body.prompt;
      return { ok: true, json: async () => ({ taskId: "task-local-fallback" }) };
    }
    if (String(url).includes("/api/images/status")) {
      return { ok: true, json: async () => ({ state: "success", imageUrl: "https://cdn.example.com/local-fallback.png" }) };
    }
    return { ok: true, json: async () => ({}) };
  };

  try {
    await runImageJob(store, job.id);
    await waitFor(() => state.jobs[0].status === "review");

    assert.match(generatedPrompt, new RegExp(product.name));
    assert.equal(state.jobs[0].outputType, "image");
    assert.equal(state.jobs[0].imageUrl, "https://cdn.example.com/local-fallback.png");
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
