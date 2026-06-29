import { appendAudioAssetToState } from "./media-state-store.mjs";
import { isPostgresConfigured, queryPostgres } from "./postgres-client.mjs";
import { ensureAudioReminderTable } from "./audio-refresh-reminders.mjs";

export async function backfillAudioLibraryFromReminders(deps = {}) {
  if (!isDbConfigured(deps)) return { backfilled: 0, skipped: true, reason: "postgres_not_configured" };
  const query = deps.query || queryPostgres;
  await ensureAudioReminderTable(query);
  const result = await query(
    `select id, audio_url, audio_title, file_name, uploaded_at
       from studio_audio_refresh_reminders
      where coalesce(audio_url, '') <> ''
      order by uploaded_at asc, id asc`
  );
  let backfilled = 0;
  for (const row of result.rows) {
    await appendAudioAssetToState(audioFromReminder(row), deps);
    backfilled += 1;
  }
  return { backfilled, skipped: false };
}

function audioFromReminder(row) {
  return {
    id: `audio-reminder-${row.id}`,
    title: row.audio_title || row.file_name || "Аудио файл",
    fileName: row.file_name || "",
    fileType: inferAudioType(row.file_name || row.audio_url),
    fileSize: 0,
    fileData: row.audio_url,
    createdAt: toIsoString(row.uploaded_at)
  };
}

function inferAudioType(value = "") {
  const lower = String(value).toLowerCase();
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".m4a")) return "audio/mp4";
  if (lower.endsWith(".ogg")) return "audio/ogg";
  return "audio/mpeg";
}

function toIsoString(value) {
  if (!value) return new Date().toISOString();
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function isDbConfigured(deps) {
  return deps.isPostgresConfigured ? deps.isPostgresConfigured() : isPostgresConfigured();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  backfillAudioLibraryFromReminders()
    .then((result) => {
      console.log(JSON.stringify(result));
    })
    .catch((error) => {
      console.error(error.stack || error.message || error);
      process.exit(1);
    });
}
