import test from "node:test";
import assert from "node:assert/strict";
import { backfillAudioLibraryFromReminders } from "../scripts/backfill-audio-library-from-reminders.mjs";

test("audio backfill restores library assets from reminder S3 urls", async () => {
  const queries = [];
  const query = async (text, params = []) => {
    queries.push({ text, params });
    if (/select id, audio_url, audio_title, file_name, uploaded_at/i.test(text)) {
      return {
        rows: [{
          id: "17",
          audio_url: "https://s3.example.com/audio/reel.mp3",
          audio_title: "ReelAudio-22996.mp3",
          file_name: "ReelAudio-22996.mp3",
          uploaded_at: "2026-06-29T17:00:45.209Z"
        }]
      };
    }
    if (/select data from app_state/i.test(text)) return { rows: [{ data: { audioLibrary: [] } }] };
    return { rows: [] };
  };

  const result = await backfillAudioLibraryFromReminders({
    query,
    appStateKey: "default",
    isPostgresConfigured: () => true
  });

  assert.deepEqual(result, { backfilled: 1, skipped: false });
  assert.ok(queries.some(({ text, params }) =>
    /insert into studio_global_audio_assets/i.test(text) && params.includes("audio-reminder-17")
  ));
  assert.ok(queries.some(({ text, params }) =>
    /insert into app_state/i.test(text) && String(params[1]).includes("https://s3.example.com/audio/reel.mp3")
  ));
});
