import test from "node:test";
import assert from "node:assert/strict";
import { resumeRunningImageJobs } from "../src/ui/job-runner.js";

test("resume waits for store hydration before reconnecting server jobs", async () => {
  const originalFetch = globalThis.fetch;
  const job = {
    id: "job-hydrated-server",
    status: "running",
    stage: "image",
    progress: 44,
    serverJobAcceptedAt: "2026-06-25T20:00:00.000Z",
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

  globalThis.fetch = async () => {
    fetchCalled = true;
    return {
      ok: true,
      json: async () => ({
        job: {
          ...job,
          status: "review",
          stage: "approval",
          progress: 76,
          imageUrl: "https://cdn.example.com/hydrated.png"
        }
      })
    };
  };

  try {
    const pending = resumeRunningImageJobs(store);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(fetchCalled, false);

    releaseHydration();
    await pending;

    assert.equal(fetchCalled, true);
    assert.equal(job.status, "review");
    assert.equal(job.imageUrl, "https://cdn.example.com/hydrated.png");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
