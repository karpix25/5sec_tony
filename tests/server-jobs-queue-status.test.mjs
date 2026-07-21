import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { createServerJobsApiHandler } from "../scripts/server-jobs.mjs";

test("queue-managed persisted job is returned as-is instead of resumed as orphan", async () => {
  const persisted = [];
  const contexts = [];
  const handle = createServerJobsApiHandler({
    serverJobs: new Map(),
    shouldUseQueueWorker: () => true,
    loadPersistedServerJob: async () => ({
      id: "job-queue-placeholder",
      status: "running",
      stage: "brief",
      progress: 6,
      queueName: "generation",
      queueStatus: "",
      failMsg: "Готовим идею"
    }),
    loadPersistedServerJobContext: async (job) => {
      contexts.push(job.id);
      return {};
    },
    persistServerJobSnapshot: async (job) => {
      persisted.push({ ...job });
      return true;
    }
  });

  const response = await callServerJobsApi("/api/jobs/status?jobId=job-queue-placeholder", handle);

  assert.equal(response.status, 200);
  assert.equal(response.payload.job.status, "running");
  assert.equal(response.payload.job.stage, "brief");
  assert.equal(response.payload.job.failMsg, "Готовим идею");
  assert.deepEqual(contexts, []);
  assert.deepEqual(persisted, []);
});

async function callServerJobsApi(path, handle) {
  const request = Readable.from([]);
  request.method = "GET";
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
