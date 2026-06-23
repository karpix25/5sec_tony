import assert from "node:assert/strict";
import test from "node:test";

import { persistServerJobSnapshot } from "../scripts/server-job-state.mjs";

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
  assert.equal(queries.some(({ text }) => /update studio_jobs/i.test(text)), true);
  assert.equal(queries.some(({ text }) => /update app_state/i.test(text)), false);
});

function createQueryRecorder(queries) {
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
          extra: {}
        }]
      };
    }
    return { rows: [] };
  };
}
