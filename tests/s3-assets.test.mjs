import test from "node:test";
import assert from "node:assert/strict";
import { resolveImageInputUrls } from "../scripts/reference-assets.mjs";

const tinyPng = "data:image/png;base64,iVBORw0KGgo=";

test("reference asset resolver uploads local data images to S3 when configured", async () => {
  const env = snapshotS3Env();
  const originalFetch = globalThis.fetch;
  const uploads = [];
  process.env.S3_BUCKET = "anton-assets";
  process.env.S3_REGION = "ru1";
  process.env.S3_ENDPOINT = "https://s3.ru1.storage.beget.cloud";
  process.env.S3_ACCESS_KEY_ID = "test-access";
  process.env.S3_SECRET_ACCESS_KEY = "test-secret";
  delete process.env.PUBLIC_BASE_URL;
  delete process.env.APP_PUBLIC_URL;
  delete process.env.NGROK_URL;
  globalThis.fetch = async (url, options = {}) => {
    uploads.push({ url: String(url), options });
    return { ok: true, text: async () => "" };
  };

  try {
    const resolved = await resolveImageInputUrls([tinyPng, "https://cdn.example.com/style.png"], {
      headers: { host: "127.0.0.1:4190" }
    });

    assert.equal(resolved.length, 2);
    assert.match(resolved[0], /^https:\/\/s3\.ru1\.storage\.beget\.cloud\/anton-assets\/anton-5-sec\/references\//);
    assert.equal(resolved[1], "https://cdn.example.com/style.png");
    const putUploads = uploads.filter((item) => item.options.method === "PUT");
    assert.equal(putUploads.length, 1);
    assert.match(putUploads[0].url, /^https:\/\/s3\.ru1\.storage\.beget\.cloud\/anton-assets\/anton-5-sec\/references\//);
    assert.equal(putUploads[0].options.headers["content-type"], "image/png");
    assert.match(putUploads[0].options.headers.authorization, /^AWS4-HMAC-SHA256 /);
  } finally {
    globalThis.fetch = originalFetch;
    restoreS3Env(env);
  }
});

function snapshotS3Env() {
  return {
    S3_BUCKET: process.env.S3_BUCKET,
    S3_REGION: process.env.S3_REGION,
    S3_ENDPOINT: process.env.S3_ENDPOINT,
    S3_PUBLIC_BASE_URL: process.env.S3_PUBLIC_BASE_URL,
    S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
    PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL,
    APP_PUBLIC_URL: process.env.APP_PUBLIC_URL,
    NGROK_URL: process.env.NGROK_URL
  };
}

function restoreS3Env(env) {
  Object.entries(env).forEach(([key, value]) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  });
}
