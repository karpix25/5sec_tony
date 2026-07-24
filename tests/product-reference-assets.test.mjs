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

test("product reference asset API accepts multipart product photos", async () => {
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
    const request = createMultipartImageRequest({
      fields: { productId: "product-1", imageName: "front.png", title: "Фото упаковки" },
      fileName: "front.png",
      mimeType: "image/png",
      buffer: Buffer.from("product-image")
    });
    const handled = await handleProductReferenceAssetsApi(request, response, new URL("http://127.0.0.1:4173/api/product-reference-assets"));
    const { status, payload } = response.readJson();

    assert.equal(handled, true);
    assert.equal(status, 200);
    assert.equal(payload.reference.title, "Фото упаковки");
    assert.equal(payload.reference.imageName, "front.png");
    assert.match(payload.reference.imageData, /^https:\/\/s3\.ru1\.storage\.beget\.cloud\/anton-assets\/anton-5-sec\/product-references\//);
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

function createMultipartImageRequest({ fields = {}, fileName, mimeType, buffer }) {
  const boundary = "----anton-test-boundary";
  const parts = Object.entries(fields).map(([name, value]) =>
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`)
  );
  parts.push(Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${fileName}"\r\nContent-Type: ${mimeType}\r\n\r\n`),
    buffer,
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ]));
  const request = Readable.from(parts);
  request.method = "POST";
  request.headers = { host: "127.0.0.1:4173", "content-type": `multipart/form-data; boundary=${boundary}` };
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
