import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { handleYandexDiskApi } from "../scripts/yandex-disk-api.mjs";

test("yandex upload retries locked folders and delayed public links", async () => {
  const previousFetch = globalThis.fetch;
  const previousToken = process.env.YANDEX_DISK_TOKEN;
  const previousRetryBase = process.env.YANDEX_DISK_RETRY_BASE_MS;
  const folderAttempts = new Map();
  let publicReads = 0;
  process.env.YANDEX_DISK_TOKEN = "token";
  process.env.YANDEX_DISK_RETRY_BASE_MS = "1";

  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    const method = options.method || "GET";
    const parsed = new URL(href);

    if (href === "https://source.example.com/final.mp4") {
      return { ok: true, arrayBuffer: async () => new TextEncoder().encode("video").buffer };
    }
    if (href.startsWith("https://upload.example.com/")) {
      assert.equal(method, "PUT");
      return jsonResponse({});
    }
    if (href.includes("/upload?")) return jsonResponse({ href: "https://upload.example.com/file" });
    if (href.includes("/publish?")) return jsonResponse({});
    if (href.includes("fields=path%2Cpublic_url%2Cname%2Ctype")) {
      publicReads += 1;
      return jsonResponse(publicReads === 1 ? { path: "disk:/ВИДЕО/5сек/final.mp4" } : {
        path: "disk:/ВИДЕО/5сек/final.mp4",
        public_url: "https://disk.yandex.ru/i/final-public"
      });
    }
    if (parsed.origin === "https://cloud-api.yandex.net" && method === "PUT") {
      const path = parsed.searchParams.get("path");
      const nextAttempt = (folderAttempts.get(path) || 0) + 1;
      folderAttempts.set(path, nextAttempt);
      if (path === "disk:/ВИДЕО/5сек" && nextAttempt === 1) {
        return jsonResponse({ message: "Ресурс заблокирован. Возможно, над ним выполняется другая операция." }, false, 423);
      }
      return jsonResponse({});
    }
    throw new Error(`unexpected fetch ${href}`);
  };

  try {
    const response = await callYandexDiskApi("POST", "/api/yandex-disk/upload", {
      fileUrl: "https://source.example.com/final.mp4",
      targetFolder: "disk:/ВИДЕО/5сек",
      fileName: "final.mp4"
    });

    assert.equal(response.status, 200);
    assert.equal(response.payload.publicUrl, "https://disk.yandex.ru/i/final-public");
    assert.equal(folderAttempts.get("disk:/ВИДЕО/5сек"), 2);
    assert.equal(publicReads, 2);
  } finally {
    globalThis.fetch = previousFetch;
    restoreEnv("YANDEX_DISK_TOKEN", previousToken);
    restoreEnv("YANDEX_DISK_RETRY_BASE_MS", previousRetryBase);
  }
});

test("yandex upload serializes concurrent disk mutations", async () => {
  const previousFetch = globalThis.fetch;
  const previousToken = process.env.YANDEX_DISK_TOKEN;
  const previousRetryBase = process.env.YANDEX_DISK_RETRY_BASE_MS;
  let activeMutations = 0;
  let maxActiveMutations = 0;
  process.env.YANDEX_DISK_TOKEN = "token";
  process.env.YANDEX_DISK_RETRY_BASE_MS = "1";

  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    const method = options.method || "GET";
    if (href.startsWith("https://upload.example.com/")) return trackMutation(() => jsonResponse({}));
    if (href.includes("/upload?")) return trackMutation(() => jsonResponse({ href: `https://upload.example.com/${encodeURIComponent(href)}` }));
    if (href.includes("/publish?")) return trackMutation(() => jsonResponse({}));
    if (href.includes("fields=path%2Cpublic_url%2Cname%2Ctype")) {
      return trackMutation(() => jsonResponse({ public_url: "https://disk.yandex.ru/i/public" }));
    }
    if (href.startsWith("https://cloud-api.yandex.net/v1/disk/resources?") && method === "PUT") {
      return trackMutation(() => jsonResponse({}));
    }
    throw new Error(`unexpected fetch ${href}`);
  };

  async function trackMutation(buildResponse) {
    activeMutations += 1;
    maxActiveMutations = Math.max(maxActiveMutations, activeMutations);
    await new Promise((resolve) => setTimeout(resolve, 5));
    activeMutations -= 1;
    return buildResponse();
  }

  try {
    const [first, second] = await Promise.all([
      callYandexDiskApi("POST", "/api/yandex-disk/upload", {
        fileUrl: "data:video/mp4;base64,dmA=",
        targetFolder: "disk:/ВИДЕО/5сек/А",
        fileName: "a.mp4"
      }),
      callYandexDiskApi("POST", "/api/yandex-disk/upload", {
        fileUrl: "data:video/mp4;base64,dmI=",
        targetFolder: "disk:/ВИДЕО/5сек/Б",
        fileName: "b.mp4"
      })
    ]);

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(maxActiveMutations, 1);
  } finally {
    globalThis.fetch = previousFetch;
    restoreEnv("YANDEX_DISK_TOKEN", previousToken);
    restoreEnv("YANDEX_DISK_RETRY_BASE_MS", previousRetryBase);
  }
});

function callYandexDiskApi(method, path, body) {
  const request = Readable.from([JSON.stringify(body || {})]);
  request.method = method;
  const chunks = [];
  const response = {
    statusCode: 200,
    headers: {},
    writeHead(status, headers) {
      this.statusCode = status;
      this.headers = headers;
    },
    end(chunk = "") {
      chunks.push(String(chunk));
    }
  };
  return handleYandexDiskApi(request, response, new URL(path, "http://local")).then(() => ({
    status: response.statusCode,
    headers: response.headers,
    payload: JSON.parse(chunks.join("") || "{}")
  }));
}

function jsonResponse(payload, ok = true, status = ok ? 200 : 500) {
  return { ok, status, json: async () => payload };
}

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
