import assert from "node:assert/strict";
import test from "node:test";

import { auditYandexUploads } from "../scripts/repair-yandex-uploads.mjs";

test("repair yandex uploads dry-run reports resources missing on disk", async () => {
  const updates = [];
  const result = await auditYandexUploads({
    isPostgresConfigured: () => true,
    token: "token",
    project: "MOLEKULAR",
    query: createRepairQuery(updates),
    fetch: async (url) => {
      const href = String(url);
      if (href.includes("exists.mp4")) {
        return jsonResponse({ path: "disk:/exists.mp4", name: "exists.mp4", type: "file", size: 1200 });
      }
      return jsonResponse({ error: "DiskNotFoundError" }, 404);
    }
  });

  assert.equal(result.checked, 2);
  assert.equal(result.ok, 1);
  assert.equal(result.missing, 1);
  assert.equal(result.missingItems[0].id, "job-missing");
  assert.equal(updates.length, 0);
});

test("repair yandex uploads apply marks missing rows cautiously", async () => {
  const updates = [];
  const result = await auditYandexUploads({
    apply: true,
    isPostgresConfigured: () => true,
    token: "token",
    query: createRepairQuery(updates),
    fetch: async () => jsonResponse({ error: "DiskNotFoundError" }, 404)
  });

  assert.equal(result.missing, 2);
  assert.equal(updates.length, 2);
  assert.match(updates[0].text, /update studio_jobs/i);
  assert.equal(updates[0].params[1], "job-ok");
  assert.match(updates[0].params[2], /missing_on_disk/);
});

function createRepairQuery(updates) {
  return async function query(text, params = []) {
    if (/update studio_jobs/i.test(text)) {
      updates.push({ text, params });
      return { rows: [] };
    }
    return {
      rows: [{
        id: "job-ok",
        project_id: "project-1",
        project_name: "MOLEKULAR",
        product_id: "product-1",
        product_name: "Шампунь ICONIC",
        disk_path: "disk:/exists.mp4",
        disk_status: "done",
        disk_verified_at: "2026-07-22T12:00:00.000Z",
        final_video_url: "https://disk.yandex.ru/i/exists"
      }, {
        id: "job-missing",
        project_id: "project-1",
        project_name: "MOLEKULAR",
        product_id: "product-1",
        product_name: "Шампунь ICONIC",
        disk_path: "disk:/missing.mp4",
        disk_status: "done",
        disk_verified_at: "2026-07-22T12:01:00.000Z",
        final_video_url: "https://disk.yandex.ru/i/missing"
      }]
    };
  };
}

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  };
}
