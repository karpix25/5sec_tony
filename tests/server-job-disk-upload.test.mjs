import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { createServerJobsApiHandler } from "../scripts/server-jobs.mjs";

test("server job fails terminally when local video is missing during disk upload", async () => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  const persisted = [];
  globalThis.setTimeout = (callback) => originalSetTimeout(callback, 0);
  globalThis.fetch = async (url) => {
    if (String(url).includes("/api/images/generate")) return jsonResponse({ taskId: "image-task-missing-video" });
    if (String(url).includes("/api/images/status")) {
      return jsonResponse({ state: "success", imageUrl: "https://cdn.example.com/missing-video.png" });
    }
    if (String(url).includes("/api/avatar-videos/composite")) {
      return jsonResponse({ videoUrl: "/generated/avatar-videos/missing-local.mp4", hasAudio: true });
    }
    if (String(url).includes("/api/yandex-disk/upload")) {
      return jsonResponse({ error: "ENOENT: no such file or directory, open 'generated/avatar-videos/missing-local.mp4'" }, false);
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
    await callServerJobsApi("POST", "/api/jobs/run", {
      job: {
        id: "job-missing-local-upload",
        projectId: "project-1",
        productId: "product-1",
        outputType: "final-video",
        prompt: "Render missing local upload"
      },
      context: { project: { id: "project-1", yandexDiskFolder: "disk:/out" } }
    }, handle);

    const failed = await waitForServerJob("job-missing-local-upload", (item) => item.job.status === "failed", handle);
    assert.equal(failed.job.queueStatus, "failed");
    assert.equal(failed.job.diskStatus, "failed");
    assert.match(failed.job.serverJobFailedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.match(failed.job.failMsg, /ENOENT/);
    assert.equal(persisted.some((job) => job.status === "running" && job.diskStatus === "failed"), false);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
  }
});

async function waitForServerJob(jobId, predicate, handle) {
  for (let index = 0; index < 120; index += 1) {
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
  return { ok, json: async () => payload };
}
