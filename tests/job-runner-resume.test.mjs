import test from "node:test";
import assert from "node:assert/strict";
import { projects } from "../src/domain/entities.js";
import { runImageJob, resumeRunningImageJobs } from "../src/ui/job-runner.js";

test("running job reconnects to server status after page reload", async () => {
  const restore = installImmediateTimers();
  const originalFetch = globalThis.fetch;
  const job = {
    id: "job-resume-server",
    projectId: "supplements",
    status: "running",
    stage: "prompt",
    progress: 12,
    serverJobAcceptedAt: "2026-06-25T20:00:00.000Z",
    outputType: "image",
    failMsg: ""
  };
  const store = createTestStore({ jobs: [job] });

  globalThis.fetch = async (url) => {
    assert.match(String(url), /\/api\/jobs\/status\?jobId=job-resume-server/);
    return jsonResponse({
      job: {
        ...job,
        status: "review",
        stage: "approval",
        progress: 76,
        imageUrl: "https://cdn.example.com/result.png",
        failMsg: ""
      }
    });
  };

  try {
    await resumeRunningImageJobs(store);

    assert.equal(job.status, "review");
    assert.equal(job.stage, "approval");
    assert.equal(job.imageUrl, "https://cdn.example.com/result.png");
    assert.doesNotMatch(job.failMsg, /прервана обновлением страницы/);
  } finally {
    globalThis.fetch = originalFetch;
    restore();
  }
});

test("image job starts on the server and mirrors final status into the queue", async () => {
  const restore = installImmediateTimers();
  const originalFetch = globalThis.fetch;
  const project = projects.find((item) => item.id === "supplements");
  const job = {
    id: "job-server-run",
    projectId: project.id,
    productId: "product-1",
    status: "queued",
    stage: "idea",
    progress: 6,
    outputType: "final-video",
    prompt: "Generate a vertical product video"
  };
  const state = {
    projects: [project],
    products: [{ id: "product-1", projectId: project.id, name: "Шиммер" }],
    jobs: [job],
    selectedAudioId: "audio-1",
    selectedCharacterId: "char-1",
    audioLibrary: [{ id: "audio-1", title: "Beat", fileData: "data:audio/wav;base64,UklGRg==" }]
  };
  const store = createTestStore(state);
  let runPayload = null;
  let markedUsage = null;
  store.markAvatarVideoUsed = (characterId, videoId, nextIndex, nextCharacterIndex) => {
    markedUsage = { characterId, videoId, nextIndex, nextCharacterIndex };
  };

  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes("/api/jobs/run")) {
      runPayload = JSON.parse(options.body || "{}");
      return jsonResponse({ job: { ...job, status: "running", stage: "image", progress: 24 } });
    }
    if (String(url).includes("/api/jobs/status")) {
      return jsonResponse({
        job: {
          ...job,
          status: "done",
          stage: "export",
          progress: 100,
          finalVideoUrl: "/generated/avatar-videos/final.mp4",
          finalVideoHasAudio: true,
          failMsg: ""
        },
        avatarUsage: {
          characterId: "char-1",
          videoId: "video-1",
          nextIndex: 1,
          nextCharacterIndex: 0
        }
      });
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  try {
    await runImageJob(store, job.id);
    await waitFor(() => state.jobs[0].status === "done");

    assert.equal(runPayload.job.id, job.id);
    assert.equal(runPayload.context.project.id, project.id);
    assert.equal(runPayload.context.product.name, "Шиммер");
    assert.equal(runPayload.context.selectedAudioId, "audio-1");
    assert.equal(state.jobs[0].finalVideoUrl, "/generated/avatar-videos/final.mp4");
    assert.deepEqual(markedUsage, { characterId: "char-1", videoId: "video-1", nextIndex: 1, nextCharacterIndex: 0 });
  } finally {
    globalThis.fetch = originalFetch;
    restore();
  }
});

test("running job shows a retryable failure when server memory no longer has it", async () => {
  const restore = installImmediateTimers();
  const originalFetch = globalThis.fetch;
  const job = {
    id: "job-missing-server",
    status: "running",
    stage: "image",
    progress: 44,
    serverJobAcceptedAt: "2026-06-25T20:00:00.000Z",
    failMsg: ""
  };
  const store = createTestStore({ jobs: [job] });

  globalThis.fetch = async () => jsonResponse({ error: "server job not found" }, false);

  try {
    await resumeRunningImageJobs(store);

    assert.equal(job.status, "failed");
    assert.equal(job.progress, 100);
    assert.match(job.failMsg, /Серверная задача не найдена/);
  } finally {
    globalThis.fetch = originalFetch;
    restore();
  }
});

test("running local job without server acceptance is not resumed after reload", async () => {
  const originalFetch = globalThis.fetch;
  const job = {
    id: "job-local-only",
    status: "running",
    stage: "image",
    progress: 44,
    failMsg: "Передали генерацию серверу..."
  };
  const store = createTestStore({ jobs: [job] });
  let fetchCalled = false;

  globalThis.fetch = async () => {
    fetchCalled = true;
    return jsonResponse({ error: "server job not found" }, false);
  };

  try {
    await resumeRunningImageJobs(store);

    assert.equal(fetchCalled, false);
    assert.equal(job.status, "running");
    assert.equal(job.failMsg, "Передали генерацию серверу...");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function createTestStore(state) {
  return {
    getState: () => state,
    patchJob: (jobId, payload) => {
      const target = state.jobs.find((item) => item.id === jobId);
      if (target) Object.assign(target, payload);
    }
  };
}

function jsonResponse(payload, ok = true) {
  return {
    ok,
    json: async () => payload
  };
}

function installImmediateTimers() {
  const originalSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (callback) => originalSetTimeout(callback, 0);
  return () => { globalThis.setTimeout = originalSetTimeout; };
}

async function waitFor(predicate) {
  for (let index = 0; index < 30; index += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("condition was not met");
}
