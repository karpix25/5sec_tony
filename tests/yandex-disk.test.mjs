import test from "node:test";
import assert from "node:assert/strict";
import { listYandexFolders } from "../scripts/yandex-disk-api.mjs";
import { listYandexDiskFolders } from "../src/services/yandex-disk.js";

test("yandex folder API lists nested folders from video root", async () => {
  const previousFetch = globalThis.fetch;
  const requestedPaths = [];
  globalThis.fetch = async (url) => {
    const path = new URL(String(url)).searchParams.get("path");
    requestedPaths.push(path);
    const children = {
      "disk:/ВИДЕО": [
        { type: "dir", path: "disk:/ВИДЕО/Клиент" },
        { type: "file", path: "disk:/ВИДЕО/readme.txt" }
      ],
      "disk:/ВИДЕО/Клиент": [
        { type: "dir", path: "disk:/ВИДЕО/Клиент/Проект" }
      ],
      "disk:/ВИДЕО/Клиент/Проект": []
    }[path] || [];
    return {
      ok: true,
      json: async () => ({ _embedded: { items: children } })
    };
  };

  try {
    const folders = await listYandexFolders("token", "disk:/ВИДЕО");

    assert.deepEqual(folders, [
      "disk:/ВИДЕО",
      "disk:/ВИДЕО/Клиент",
      "disk:/ВИДЕО/Клиент/Проект"
    ]);
    assert.deepEqual(requestedPaths, [
      "disk:/ВИДЕО",
      "disk:/ВИДЕО/Клиент",
      "disk:/ВИДЕО/Клиент/Проект"
    ]);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("yandex folder client requests the video root by default", async () => {
  const previousFetch = globalThis.fetch;
  let requestedUrl = "";
  globalThis.fetch = async (url) => {
    requestedUrl = String(url);
    return {
      ok: true,
      json: async () => ({ root: "disk:/ВИДЕО", folders: ["disk:/ВИДЕО"] })
    };
  };

  try {
    const payload = await listYandexDiskFolders();

    assert.equal(new URL(requestedUrl, "http://local").searchParams.get("root"), "disk:/ВИДЕО");
    assert.deepEqual(payload.folders, ["disk:/ВИДЕО"]);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
