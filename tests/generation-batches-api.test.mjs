import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { handleGenerationBatchesApi } from "../scripts/generation-batches-api.mjs";

test("generation batches API rejects automation when BullMQ env is missing", async () => {
  const envSnapshot = snapshotQueueEnv();
  delete process.env.JOB_QUEUE_MODE;
  delete process.env.JOB_QUEUE_NAME;
  delete process.env.REDIS_HOST;
  delete process.env.REDIS_URL;
  delete process.env.JOB_QUEUE_STRICT;

  try {
    const response = await callGenerationBatchesApi("POST", "/api/generation/batches", {
      count: 1,
      source: "automation",
      requireQueue: true,
      selection: { projectId: "project-1" }
    });

    assert.equal(response.handled, true);
    assert.equal(response.status, 503);
    assert.equal(response.payload.code, "JOB_QUEUE_NOT_CONFIGURED");
    assert.match(response.payload.error, /Серверная очередь не настроена/);
    assert.match(response.payload.error, /Авторежим не запущен/);
  } finally {
    restoreQueueEnv(envSnapshot);
  }
});

test("generation batches API requires strict queue mode for automation", async () => {
  const envSnapshot = snapshotQueueEnv();
  process.env.JOB_QUEUE_MODE = "bullmq";
  process.env.REDIS_HOST = "redis";
  delete process.env.JOB_QUEUE_STRICT;

  try {
    const response = await callGenerationBatchesApi("POST", "/api/generation/batches", {
      count: 1,
      source: "automation",
      selection: { projectId: "project-1" }
    });

    assert.equal(response.status, 503);
    assert.equal(response.payload.code, "JOB_QUEUE_NOT_CONFIGURED");
    assert.match(response.payload.error, /JOB_QUEUE_STRICT/);
  } finally {
    restoreQueueEnv(envSnapshot);
  }
});

function snapshotQueueEnv() {
  return {
    JOB_QUEUE_MODE: process.env.JOB_QUEUE_MODE,
    JOB_QUEUE_NAME: process.env.JOB_QUEUE_NAME,
    REDIS_HOST: process.env.REDIS_HOST,
    REDIS_URL: process.env.REDIS_URL,
    JOB_QUEUE_STRICT: process.env.JOB_QUEUE_STRICT
  };
}

function restoreQueueEnv(snapshot) {
  Object.entries(snapshot).forEach(([key, value]) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  });
}

async function callGenerationBatchesApi(method, path, body) {
  const request = Readable.from([JSON.stringify(body)]);
  request.method = method;
  const response = createResponse();
  const handled = await handleGenerationBatchesApi(request, response, new URL(`http://local.test${path}`));
  return { handled, status: response.status, payload: JSON.parse(response.body || "{}") };
}

function createResponse() {
  return {
    status: 0,
    body: "",
    writeHead(status) {
      this.status = status;
    },
    end(body) {
      this.body = body || "";
    }
  };
}
