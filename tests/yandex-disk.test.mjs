import test from "node:test";
import assert from "node:assert/strict";
import { listYandexFolders } from "../scripts/yandex-disk-api.mjs";
import { listYandexDiskFolders } from "../src/services/yandex-disk.js";
import { renderProjectManagementSettings } from "../src/ui/project.js";

test("yandex folder API lists nested folders from video root", async () => {
  const previousFetch = globalThis.fetch;
  const requestedPaths = [];
  globalThis.fetch = async (url) => {
    const parsedUrl = new URL(String(url));
    const path = parsedUrl.searchParams.get("path");
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
      json: async () => ({
        _embedded: {
          items: children,
          limit: Number(parsedUrl.searchParams.get("limit")),
          offset: Number(parsedUrl.searchParams.get("offset")),
          total: children.length
        }
      })
    };
  };

  try {
    const folders = await listYandexFolders("token", "disk:/ВИДЕО");

    assert.deepEqual(folders, [
      { path: "disk:/ВИДЕО", depth: 0, name: "ВИДЕО", label: "disk:/ВИДЕО" },
      { path: "disk:/ВИДЕО/Клиент", depth: 1, name: "Клиент", label: "Клиент" },
      { path: "disk:/ВИДЕО/Клиент/Проект", depth: 2, name: "Проект", label: "Клиент/Проект" }
    ]);
    assert.deepEqual(requestedPaths, [
      "disk:/ВИДЕО",
      "disk:/ВИДЕО/Клиент"
    ]);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("yandex folder API uses pages and narrow fields for large folders", async () => {
  const previousFetch = globalThis.fetch;
  const offsets = [];
  let fields = "";
  globalThis.fetch = async (url) => {
    const parsedUrl = new URL(String(url));
    offsets.push(Number(parsedUrl.searchParams.get("offset")));
    fields = parsedUrl.searchParams.get("fields");
    const offset = Number(parsedUrl.searchParams.get("offset"));
    const items = offset === 0
      ? [{ type: "dir", name: "A", path: "disk:/ВИДЕО/A" }]
      : [{ type: "dir", name: "B", path: "disk:/ВИДЕО/B" }];
    return {
      ok: true,
      json: async () => ({ _embedded: { items, limit: 200, offset, total: 400 } })
    };
  };

  try {
    const folders = await listYandexFolders("token", "disk:/ВИДЕО", { depth: 1, max: 10 });

    assert.deepEqual(offsets, [0, 200]);
    assert.match(fields, /_embedded\.items\.path/);
    assert.deepEqual(folders.map((folder) => folder.path), ["disk:/ВИДЕО", "disk:/ВИДЕО/A", "disk:/ВИДЕО/B"]);
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
    assert.equal(new URL(requestedUrl, "http://local").searchParams.get("depth"), "2");
    assert.equal(new URL(requestedUrl, "http://local").searchParams.get("max"), "120");
    assert.deepEqual(payload.folders, ["disk:/ВИДЕО"]);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("yandex folder field uses one tree dropdown and keeps full disk path", () => {
  const html = renderProjectManagementSettings({
    project: {
      id: "project",
      name: "Проект",
      exportFolder: "Готовые",
      yandexDiskFolder: "disk:/ВИДЕО/Клиент/Проект",
      dailyLimit: 20,
      projectLimit: 100
    }
  });

  assert.match(html, /data-yandex-folder-picker/);
  assert.match(html, /data-yandex-folder-levels/);
  assert.match(html, /name="yandexDiskFolder" type="hidden" value="disk:\/ВИДЕО\/Клиент\/Проект"/);
  assert.doesNotMatch(html, /Уровень 1/);
  assert.doesNotMatch(html, /<select name="yandexDiskFolder"/);
});
