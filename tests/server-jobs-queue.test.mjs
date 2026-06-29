import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { createServerJobsApiHandler } from "../scripts/server-jobs.mjs";

test("server job can enqueue to external worker without running pipeline inline", async () => {
  const originalFetch = globalThis.fetch;
  const persisted = [];
  const ledgerEnqueues = [];
  const ledgerPatches = [];
  const dispatches = [];
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error("inline pipeline should not run");
  };
  const handle = createServerJobsApiHandler({
    serverJobs: new Map(),
    persistServerJobSnapshot: async (job) => {
      persisted.push({ ...job });
      return true;
    },
    enqueueJobLedgerRecord: async (job, context) => {
      ledgerEnqueues.push({ job: { ...job }, context });
      return { id: job.id, queueStatus: "queued" };
    },
    patchJobLedgerRecord: async (job) => {
      ledgerPatches.push({ ...job });
      return true;
    },
    dispatchJobToQueue: async (job) => {
      dispatches.push({ ...job });
      return { mode: "bullmq", enqueued: true };
    }
  });

  try {
    const started = await callServerJobsApi("POST", "/api/jobs/run", {
      job: { id: "job-external-worker", projectId: "project-1", productId: "product-1", outputType: "final-video" },
      context: { project: { id: "project-1", yandexDiskFolder: "" } }
    }, handle);

    assert.equal(started.status, 200);
    assert.equal(started.payload.job.status, "running");
    assert.equal(ledgerEnqueues.length, 1);
    assert.equal(ledgerPatches.length, 1);
    assert.equal(ledgerPatches[0].queueStatus, "queued");
    assert.equal(dispatches.length, 1);
    assert.equal(persisted.length, 1);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

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
