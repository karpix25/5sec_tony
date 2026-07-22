import test from "node:test";
import assert from "node:assert/strict";
import { appendAudioAssetToState, appendProductReferenceToState } from "../scripts/media-state-store.mjs";

test("uploaded audio is appended to canonical and legacy state", async () => {
  const queries = [];
  const query = async (text, params = []) => {
    queries.push({ text, params });
    if (/select data from app_state/i.test(text)) return { rows: [{ data: { audioLibrary: [] } }] };
    if (/from studio_global_audio_assets\s+where app_state_key/i.test(text)) {
      return { rows: [{
        id: "audio-s3",
        title: "Beat",
        mood: "файл аудио",
        duration: "5 sec",
        file_name: "beat.wav",
        file_type: "audio/wav",
        file_size: 123,
        file_data: "https://s3.example.com/audio/beat.wav",
        created_at: "2026-06-29T00:00:00.000Z"
      }] };
    }
    return { rows: [] };
  };

  const audio = await appendAudioAssetToState({
    id: "audio-s3",
    title: "Beat",
    fileName: "beat.wav",
    fileType: "audio/wav",
    fileSize: 123,
    fileData: "https://s3.example.com/audio/beat.wav",
    createdAt: "2026-06-29T00:00:00.000Z"
  }, { query, appStateKey: "default", isPostgresConfigured: () => true });

  assert.equal(audio.id, "audio-s3");
  assert.ok(queries.some(({ text }) => /insert into studio_global_audio_assets/i.test(text)));
  assert.ok(queries.some(({ text }) => /insert into studio_audio_library_refresh_reminders/i.test(text)));
  assert.ok(queries.some(({ text }) => /insert into studio_app_ui_state/i.test(text)));
  assert.ok(queries.some(({ text, params }) => /insert into app_state/i.test(text) && String(params[1]).includes("audio-s3")));
});

test("uploaded product photo is prepended to product references in DB state", async () => {
  const queries = [];
  const query = async (text, params = []) => {
    queries.push({ text, params });
    if (/select "references" from studio_products/i.test(text)) return { rows: [{ references: [{ id: "old-ref" }] }] };
    if (/select data from app_state/i.test(text)) return { rows: [{ data: { products: [{ id: "product-1", references: [{ id: "old-ref" }] }] } }] };
    return { rows: [] };
  };

  const reference = await appendProductReferenceToState("product-1", {
    id: "product-ref-s3",
    title: "Фото упаковки",
    imageData: "https://s3.example.com/product/front.png"
  }, { query, appStateKey: "default", isPostgresConfigured: () => true });

  assert.equal(reference.id, "product-ref-s3");
  const productUpdate = queries.find(({ text }) => /update studio_products set "references"/i.test(text));
  assert.ok(productUpdate);
  assert.match(productUpdate.params[2], /product-ref-s3/);
  assert.ok(queries.some(({ text, params }) => /insert into app_state/i.test(text) && String(params[1]).includes("product-ref-s3")));
});
