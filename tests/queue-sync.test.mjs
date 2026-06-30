import test from "node:test";
import assert from "node:assert/strict";
import { refreshQueueFromRemoteState, startQueueStatusSync } from "../src/ui/queue-sync.js";

test("queue sync merges completed server jobs from remote state", async () => {
  const originalFetch = globalThis.fetch;
  const localJob = {
    id: "job-stuck-in-ui",
    status: "running",
    stage: "image",
    progress: 72,
    failMsg: "Сервер ожидает картинку..."
  };
  const store = createTestStore({ jobs: [localJob] });

  globalThis.fetch = async (url) => {
    assert.equal(String(url), "/api/state");
    return jsonResponse({
      state: {
        jobs: [{
          ...localJob,
          status: "done",
          stage: "export",
          progress: 100,
          imageUrl: "https://cdn.example.com/final.png",
          finalVideoUrl: "/generated/avatar-videos/final.mp4",
          diskStatus: "done",
          failMsg: ""
        }]
      },
      updatedAt: "2026-06-28T02:35:09.946Z"
    });
  };

  try {
    const updates = await refreshQueueFromRemoteState(store);

    assert.equal(updates.length, 1);
    assert.equal(store.state.jobs[0].status, "done");
    assert.equal(store.state.jobs[0].stage, "export");
    assert.equal(store.state.jobs[0].finalVideoUrl, "/generated/avatar-videos/final.mp4");
    assert.equal(store.state.jobs[0].diskStatus, "done");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("queue sync keeps polling completed jobs while Yandex Disk upload is pending", async () => {
  const originalFetch = globalThis.fetch;
  const localJob = {
    id: "job-disk-uploading",
    status: "done",
    stage: "export",
    progress: 100,
    finalVideoUrl: "/generated/avatar-videos/final.mp4",
    diskStatus: "uploading",
    diskMessage: "Сервер сохраняет в Яндекс.Диск..."
  };
  const store = createTestStore({ jobs: [localJob] });

  globalThis.fetch = async (url) => {
    assert.equal(String(url), "/api/state");
    return jsonResponse({
      state: {
        jobs: [{
          ...localJob,
          diskStatus: "done",
          diskUrl: "https://yadi.sk/d/final-link",
          finalVideoUrl: "https://yadi.sk/d/final-link",
          diskMessage: "Сохранено в Яндекс.Диск"
        }]
      },
      updatedAt: "2026-06-30T12:57:25.569Z"
    });
  };

  try {
    const updates = await refreshQueueFromRemoteState(store);

    assert.equal(updates.length, 1);
    assert.equal(store.state.jobs[0].diskStatus, "done");
    assert.equal(store.state.jobs[0].diskUrl, "https://yadi.sk/d/final-link");
    assert.equal(store.state.jobs[0].finalVideoUrl, "https://yadi.sk/d/final-link");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("queue status sync starts after hydration and updates stale active jobs", async () => {
  const restoreTimers = installImmediateTimers();
  const originalFetch = globalThis.fetch;
  const localJob = {
    id: "job-sync-loop",
    status: "running",
    stage: "assembly",
    progress: 88,
    serverJobAcceptedAt: "2026-06-28T02:33:09.212Z",
    failMsg: "Сервер собирает финальное видео..."
  };
  const store = createTestStore({ jobs: [localJob] });

  globalThis.fetch = async (url) => {
    if (String(url).includes("/api/jobs/status")) {
      return jsonResponse({
        job: {
          ...localJob,
          status: "done",
          stage: "export",
          progress: 100,
          finalVideoUrl: "/generated/avatar-videos/final.mp4",
          failMsg: ""
        }
      });
    }
    if (String(url) === "/api/state") {
      return jsonResponse({ state: { jobs: store.state.jobs }, updatedAt: "2026-06-28T02:35:09.946Z" });
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  try {
    const stop = startQueueStatusSync(store, { intervalMs: 1000, stateIntervalMs: 1000 });
    await waitFor(() => store.state.jobs[0].status === "done");
    stop();

    assert.equal(store.state.jobs[0].finalVideoUrl, "/generated/avatar-videos/final.mp4");
  } finally {
    globalThis.fetch = originalFetch;
    restoreTimers();
  }
});

function createTestStore(state) {
  return {
    state,
    getState: () => state,
    whenHydrated: () => Promise.resolve(),
    subscribe(callback) {
      this.subscriber = callback;
      return () => { this.subscriber = null; };
    },
    patchJob(jobId, payload) {
      state.jobs = state.jobs.map((job) => (job.id === jobId ? { ...job, ...payload } : job));
      this.subscriber?.(state, { jobs: state.jobs });
    },
    mergeServerJobs(jobs = []) {
      const incoming = jobs.filter((job) => job?.id);
      const ids = new Set(incoming.map((job) => job.id));
      state.jobs = [...incoming, ...state.jobs.filter((job) => !ids.has(job.id))];
      this.subscriber?.(state, { jobs: state.jobs });
      return incoming;
    }
  };
}

function jsonResponse(payload, ok = true) {
  return {
    ok,
    status: ok ? 200 : 500,
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
