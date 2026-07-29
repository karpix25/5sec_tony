import assert from "node:assert/strict";
import test from "node:test";

import { loadPersistedServerJobContext, persistServerJobSnapshot } from "../scripts/server-job-state.mjs";

test("server job progress updates normalized row without touching legacy app state", async () => {
  const queries = [];
  const persisted = await persistServerJobSnapshot(
    { id: "job-1", status: "running", progress: 42, failMsg: "waiting" },
    {
      isPostgresConfigured: () => true,
      withPostgresTransaction: async (callback) => callback({ query: createQueryRecorder(queries) })
    }
  );

  assert.equal(persisted, true);
  assert.equal(queries.some(({ text }) => /pg_advisory_xact_lock/i.test(text)), true);
  assert.equal(queries.some(({ text }) => /update studio_jobs/i.test(text)), true);
  assert.equal(queries.some(({ text }) => /update app_state/i.test(text)), false);
});

test("server job progress updates keep product name snapshot in relational extra", async () => {
  const queries = [];
  const persisted = await persistServerJobSnapshot(
    { id: "job-1", status: "running", progress: 42 },
    {
      isPostgresConfigured: () => true,
      withPostgresTransaction: async (callback) => callback({
        query: createQueryRecorder(queries, { extra: { productName: "Старое имя продукта" } })
      })
    }
  );
  const update = queries.find(({ text }) => /update studio_jobs/i.test(text));
  const extra = JSON.parse(update.params.at(-1));

  assert.equal(persisted, true);
  assert.equal(extra.productName, "Старое имя продукта");
});

test("server job context restores brand and product for yandex folder path", async () => {
  const context = await loadPersistedServerJobContext(
    { projectId: "project-1", productId: "product-1", characterId: "char-1" },
    {
      isPostgresConfigured: () => true,
      withPostgresTransaction: async (callback) => callback({ query: createContextQueryRecorder() })
    }
  );

  assert.equal(context.project.client, "Power Pro");
  assert.equal(context.project.yandexDiskFolder, "disk:/ВИДЕО/5сек/BBHERB");
  assert.equal(context.product.name, "Шиммер");
  assert.equal(context.selectedCharacterId, "char-1");
});

function createQueryRecorder(queries, options = {}) {
  return async function query(text, params = []) {
    queries.push({ text, params });
    if (/to_regclass/i.test(text)) return { rows: [{ table_name: "studio_jobs" }] };
    if (/select \* from studio_jobs/i.test(text)) {
      return {
        rows: [{
          id: "job-1",
          project_id: "project-1",
          product_id: "product-1",
          character_id: "",
          status: "queued",
          stage: "",
          progress: 0,
          title: "",
          topic: "",
          music: "",
          prompt: "",
          reference_title: "",
          output_type: "",
          final_video_url: "",
          final_video_has_audio: false,
          semantic_key: "",
          meaning_pattern_id: "",
          product_visual_mode: "",
          composition_mode: "",
          content_layer_id: "",
          format: "",
          input_urls: [],
          input_refs: [],
          diversity_slot: null,
          extra: options.extra || {}
        }]
      };
    }
    return { rows: [] };
  };
}

function createContextQueryRecorder() {
  return async function query(text) {
    if (/select \* from studio_projects/i.test(text)) {
      return {
        rows: [{
          id: "project-1",
          name: "BBHERB",
          client: "Power Pro",
          yandex_disk_folder: "disk:/ВИДЕО/5сек/BBHERB",
          daily_limit: 20,
          used_today: 0,
          daily_usage_date: "",
          project_limit: 100,
          used_total: 0,
          avatar_round_robin_index: 0,
          cta_overlay: {},
          characters: [],
          extra: {}
        }]
      };
    }
    if (/select \* from studio_products/i.test(text)) {
      return {
        rows: [{
          id: "product-1",
          project_id: "project-1",
          name: "Шиммер",
          description: "",
          offer: "",
          components: "",
          pains: [],
          facts: [],
          forbidden: [],
          ai_passport: {},
          references: [],
          extra: {}
        }]
      };
    }
    if (/studio_global_audio_assets/i.test(text)) return { rows: [] };
    return { rows: [] };
  };
}
