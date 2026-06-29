import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { handleProductReferenceAssetsApi } from "../scripts/product-reference-assets.mjs";

const tinyPng = "data:image/png;base64,iVBORw0KGgo=";

test("product reference asset API uploads product photos to S3", async () => {
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
    const request = createJsonRequest({
      productId: "product-1",
      imageData: tinyPng,
      imageName: "front.png",
      title: "Фото упаковки"
    });
    const handled = await handleProductReferenceAssetsApi(request, response, new URL("http://127.0.0.1:4173/api/product-reference-assets"));
    const { status, payload } = response.readJson();

    assert.equal(handled, true);
    assert.equal(status, 200);
    assert.match(payload.url, /^https:\/\/s3\.ru1\.storage\.beget\.cloud\/anton-assets\/anton-5-sec\/product-references\//);
    assert.equal(payload.reference.imageData, payload.url);
    assert.equal(payload.reference.imageName, "front.png");
    assert.equal(uploads.length, 1);
    assert.equal(uploads[0].options.method, "PUT");
    assert.equal(uploads[0].options.headers["content-type"], "image/png");
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
