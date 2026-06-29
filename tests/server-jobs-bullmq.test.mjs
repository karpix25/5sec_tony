import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";

import { createServerJobsApiHandler } from "../scripts/server-jobs.mjs";

test("server job API keeps UI contract when BullMQ queue is enabled", async () => {
  const persisted = [];
  const enqueued = [];
  const ledgerPatches = [];
  const handle = createServerJobsApiHandler({
    serverJobs: new Map(),
    dispatchJobToQueue: async (job) => {
      enqueued.push(job.id);
      return { mode: "bullmq", enqueued: true };
    },
    persistServerJobSnapshot: async (job) => {
      persisted.push({ ...job });
      return true;
    },
    patchJobLedgerRecord: async (job) => {
      ledgerPatches.push({ ...job });
      return true;
    }
  });

  const response = await callServerJobsApi("POST", "/api/jobs/run", {
    job: {
      id: "job-bullmq-contract",
      projectId: "project-1",
      productId: "product-1",
      status: "queued",
      outputType: "image",
      prompt: "Generate image"
    },
    context: { project: { id: "project-1" } }
  }, handle);

  assert.equal(response.status, 200);
  assert.equal(response.payload.job.id, "job-bullmq-contract");
  assert.equal(response.payload.job.status, "running");
  assert.equal(response.payload.job.serverJobContext, undefined);
  assert.deepEqual(enqueued, ["job-bullmq-contract"]);
  assert.equal(persisted.some((job) => job.status === "running"), true);
  assert.equal(ledgerPatches.some((job) => job.queueStatus === "queued"), true);
});

test("BullMQ enqueue failure falls back to inline server execution", async () => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  const persisted = [];
  globalThis.setTimeout = (callback) => originalSetTimeout(callback, 0);
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes("/api/images/generate")) return jsonResponse({ taskId: "fallback-task" });
    if (String(url).includes("/api/images/status")) return jsonResponse({ state: "success", imageUrl: "https://cdn.example.com/fallback.png" });
    throw new Error(`unexpected fetch ${url} ${options.method || "GET"}`);
  };
  const handle = createServerJobsApiHandler({
    serverJobs: new Map(),
    dispatchJobToQueue: async () => {
      throw new Error("redis unavailable");
    },
    persistServerJobSnapshot: async (job) => {
      persisted.push({ ...job });
      return true;
    }
  });

  try {
    await callServerJobsApi("POST", "/api/jobs/run", {
      job: {
        id: "job-bullmq-fallback",
        projectId: "project-1",
        productId: "product-1",
        outputType: "image",
        prompt: "Generate fallback image"
      },
      context: { project: { id: "project-1" } }
    }, handle);
    const final = await waitForServerJob("job-bullmq-fallback", (payload) => payload.job.status === "review", handle);

    assert.equal(final.job.imageUrl, "https://cdn.example.com/fallback.png");
    assert.equal(persisted.some((job) => job.queueStatus === "running"), true);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
  }
});

test("strict BullMQ enqueue failure returns 503 without inline execution", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error("inline should not run");
  };
  const handle = createServerJobsApiHandler({
    serverJobs: new Map(),
    isQueueStrict: () => true,
    dispatchJobToQueue: async () => {
      throw new Error("redis unavailable");
    },
    persistServerJobSnapshot: async () => true,
    patchJobLedgerRecord: async () => true
  });

  try {
    const response = await callServerJobsApi("POST", "/api/jobs/run", {
      job: {
        id: "job-bullmq-strict",
        projectId: "project-1",
        productId: "product-1",
        outputType: "image",
        prompt: "Generate image"
      },
      context: { project: { id: "project-1" } }
    }, handle);

    assert.equal(response.status, 503);
    assert.match(response.payload.error, /Очередь воркеров недоступна/);
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("status endpoint returns persisted running job without web resume in BullMQ mode", async () => {
  const handle = createServerJobsApiHandler({
    serverJobs: new Map(),
    shouldUseQueueWorker: () => true,
    loadPersistedServerJob: async () => ({
      id: "job-worker-owned",
      status: "running",
      stage: "image",
      progress: 24,
      queueStatus: "running",
      serverJobContext: { project: { id: "project-1" } }
    }),
    loadPersistedServerJobContext: async () => {
      throw new Error("web should not resume worker-owned jobs");
    }
  });

  const response = await callServerJobsApi("GET", "/api/jobs/status?jobId=job-worker-owned", null, handle);

  assert.equal(response.status, 200);
  assert.equal(response.payload.job.id, "job-worker-owned");
  assert.equal(response.payload.job.queueStatus, "running");
  assert.equal(response.payload.job.serverJobContext, undefined);
});

async function waitForServerJob(jobId, predicate, handle) {
  for (let index = 0; index < 30; index += 1) {
    const { payload } = await callServerJobsApi("GET", `/api/jobs/status?jobId=${jobId}`, null, handle);
    if (predicate(payload)) return payload;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("server job did not finish");
}

async function callServerJobsApi(method, path, body, handle) {
  const request = Readable.from(body ? [JSON.stringify(body)] : []);
  request.method = method;
  request.headers = { host: "n8n-5sec.ap2dy7.easypanel.host" };
  const response = createJsonCaptureResponse();
  const handled = await handle(request, response, new URL(`http://127.0.0.1:4173${path}`));
  assert.equal(handled, true);
  return response.readJson();
}

function createJsonCaptureResponse() {
  return {
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
}

function jsonResponse(payload, ok = true) {
  return {
    ok,
    json: async () => payload
  };
}
