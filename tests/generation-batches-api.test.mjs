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

test("generation batches API reports missing state backend as a launch blocker", async () => {
  const envSnapshot = snapshotQueueEnv();
  const postgresSnapshot = snapshotPostgresEnv();
  delete process.env.DATABASE_URL;
  delete process.env.DB_HOST;
  delete process.env.DB_USER;
  delete process.env.DB_NAME;

  try {
    const response = await callGenerationBatchesApi("POST", "/api/generation/batches", {
      count: 1,
      selection: { projectId: "project-1" }
    });

    assert.equal(response.handled, true);
    assert.equal(response.status, 503);
    assert.equal(response.payload.code, "STATE_BACKEND_NOT_CONFIGURED");
    assert.match(response.payload.error, /Серверное состояние не настроено/);
    assert.match(response.payload.error, /Postgres is not configured/);
  } finally {
    restoreQueueEnv(envSnapshot);
    restoreEnv(postgresSnapshot);
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

function snapshotPostgresEnv() {
  return {
    DATABASE_URL: process.env.DATABASE_URL,
    DB_HOST: process.env.DB_HOST,
    DB_USER: process.env.DB_USER,
    DB_NAME: process.env.DB_NAME
  };
}

function restoreQueueEnv(snapshot) {
  restoreEnv(snapshot);
}

function restoreEnv(snapshot) {
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
