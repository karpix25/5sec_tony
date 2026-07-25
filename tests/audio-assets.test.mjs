import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { handleAudioAssetsApi } from "../scripts/audio-assets.mjs";

const tinyAudio = "data:audio/wav;base64,UklGRg==";

test("audio asset API uploads audio data URLs to S3", async () => {
  const env = snapshotS3Env();
  const dbEnv = snapshotDbEnv();
  const originalFetch = globalThis.fetch;
  const uploads = [];
  configureS3Env();
  clearDbEnv();
  globalThis.fetch = async (url, options = {}) => {
    uploads.push({ url: String(url), options });
    return { ok: true, text: async () => "" };
  };

  try {
    const response = createJsonCaptureResponse();
    const request = createJsonRequest({ audioData: tinyAudio, fileName: "beat.wav" });
    const handled = await handleAudioAssetsApi(request, response, new URL("http://127.0.0.1:4173/api/audio-assets"));
    const { status, payload } = response.readJson();

    assert.equal(handled, true);
    assert.equal(status, 200);
    assert.match(payload.url, /^https:\/\/s3\.ru1\.storage\.beget\.cloud\/anton-assets\/anton-5-sec\/audio\//);
    assert.match(payload.audio.fileData, /^https:\/\/s3\.ru1\.storage\.beget\.cloud\/anton-assets\/anton-5-sec\/audio\//);
    assert.equal(payload.audio.fileName, "beat.wav");
    assert.equal(payload.fileName, "beat.wav");
    assert.equal(payload.fileType, "audio/wav");
    assert.equal(uploads.length, 1);
    assert.equal(uploads[0].options.method, "PUT");
    assert.equal(uploads[0].options.headers["content-type"], "audio/wav");
  } finally {
    globalThis.fetch = originalFetch;
    restoreS3Env(env);
    restoreDbEnv(dbEnv);
  }
});

test("audio asset API deletes S3 object by stored public URL", async () => {
  const env = snapshotS3Env();
  const dbEnv = snapshotDbEnv();
  const originalFetch = globalThis.fetch;
  const calls = [];
  configureS3Env();
  clearDbEnv();
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return { ok: true, status: 204, text: async () => "" };
  };

  try {
    const response = createJsonCaptureResponse();
    const request = createJsonRequest({
      url: "https://s3.ru1.storage.beget.cloud/anton-assets/anton-5-sec/audio/2026-06-29/beat.wav"
    });
    const handled = await handleAudioAssetsApi(request, response, new URL("http://127.0.0.1:4173/api/audio-assets/delete"));
    const { status, payload } = response.readJson();

    assert.equal(handled, true);
    assert.equal(status, 200);
    assert.deepEqual(payload, { deleted: true, deletedAudioId: "", updatedAt: "" });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.method, "DELETE");
    assert.equal(calls[0].url, "https://s3.ru1.storage.beget.cloud/anton-assets/anton-5-sec/audio/2026-06-29/beat.wav");
    assert.match(calls[0].options.headers.authorization, /^AWS4-HMAC-SHA256 /);
  } finally {
    globalThis.fetch = originalFetch;
    restoreS3Env(env);
    restoreDbEnv(dbEnv);
  }
});

function createJsonRequest(payload) {
  const request = Readable.from([JSON.stringify(payload)]);
  request.method = "POST";
  request.headers = { host: "127.0.0.1:4173" };
  return request;
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

function configureS3Env() {
  process.env.S3_BUCKET = "anton-assets";
  process.env.S3_REGION = "ru1";
  process.env.S3_ENDPOINT = "https://s3.ru1.storage.beget.cloud";
  process.env.S3_ACCESS_KEY_ID = "test-access";
  process.env.S3_SECRET_ACCESS_KEY = "test-secret";
  delete process.env.S3_PUBLIC_BASE_URL;
}

function snapshotS3Env() {
  return {
    S3_BUCKET: process.env.S3_BUCKET,
    S3_REGION: process.env.S3_REGION,
    S3_ENDPOINT: process.env.S3_ENDPOINT,
    S3_PUBLIC_BASE_URL: process.env.S3_PUBLIC_BASE_URL,
    S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY
  };
}

function restoreS3Env(env) {
  Object.entries(env).forEach(([key, value]) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  });
}

function snapshotDbEnv() {
  return {
    DATABASE_URL: process.env.DATABASE_URL,
    DB_HOST: process.env.DB_HOST,
    DB_USER: process.env.DB_USER,
    DB_NAME: process.env.DB_NAME
  };
}

function clearDbEnv() {
  delete process.env.DATABASE_URL;
  delete process.env.DB_HOST;
  delete process.env.DB_USER;
  delete process.env.DB_NAME;
}

function restoreDbEnv(env) {
  Object.entries(env).forEach(([key, value]) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  });
}
