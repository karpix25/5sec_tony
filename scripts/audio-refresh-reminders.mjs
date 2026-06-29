import { isPostgresConfigured, queryPostgres } from "./postgres-client.mjs";
import { sendTelegramMessage } from "./telegram-notifier.mjs";

const reminderDays = 14;
const reminderMs = reminderDays * 24 * 60 * 60 * 1000;
let schedulerStarted = false;

export async function registerAudioRefreshReminder(audio, deps = {}) {
  if (!isDbConfigured(deps)) return { registered: false, reason: "postgres_not_configured" };
  const query = deps.query || queryPostgres;
  await ensureAudioReminderTable(query);
  const uploadedAt = audio.uploadedAt || new Date().toISOString();
  const nextNotifyAt = new Date(new Date(uploadedAt).getTime() + reminderMs).toISOString();
  await query(
    `insert into studio_audio_refresh_reminders
      (audio_url, audio_title, file_name, uploaded_at, next_notify_at, last_notified_at, created_at, updated_at)
     values ($1, $2, $3, $4, $5, null, now(), now())
     on conflict (audio_url) do update set
       audio_title = excluded.audio_title,
       file_name = excluded.file_name,
       uploaded_at = excluded.uploaded_at,
       next_notify_at = excluded.next_notify_at,
       updated_at = now()`,
    [audio.url || audio.fileData || "", audio.title || "", audio.fileName || "", uploadedAt, nextNotifyAt]
  );
  return { registered: true, nextNotifyAt };
}

export function startAudioRefreshReminderScheduler(deps = {}) {
  if (schedulerStarted) return;
  schedulerStarted = true;
  const intervalMs = Number(deps.intervalMs || process.env.AUDIO_REFRESH_REMINDER_INTERVAL_MS || 60 * 60 * 1000);
  const timer = setInterval(() => {
    processAudioRefreshReminders(deps).catch((error) => {
      console.warn(`[audio-reminder:error] ${error.message || error}`);
    });
  }, intervalMs);
  timer.unref?.();
  processAudioRefreshReminders(deps).catch((error) => {
    console.warn(`[audio-reminder:start:error] ${error.message || error}`);
  });
}

export async function processAudioRefreshReminders(deps = {}) {
  if (!isDbConfigured(deps)) return { processed: 0, skipped: true };
  const query = deps.query || queryPostgres;
  const sendMessage = deps.sendTelegramMessage || sendTelegramMessage;
  await ensureAudioReminderTable(query);
  const due = await query(
    `select id, audio_title, file_name, uploaded_at, next_notify_at
       from studio_audio_refresh_reminders
      where next_notify_at <= now()
      order by next_notify_at asc
      limit 20`
  );
  for (const row of due.rows) {
    await sendMessage(buildAudioRefreshMessage(row));
    await query(
      `update studio_audio_refresh_reminders
          set last_notified_at = now(),
              next_notify_at = now() + interval '14 days',
              updated_at = now()
        where id = $1`,
      [row.id]
    );
  }
  return { processed: due.rows.length, skipped: false };
}

export async function ensureAudioReminderTable(query = queryPostgres) {
  await query(`
    create table if not exists studio_audio_refresh_reminders (
      id bigserial primary key,
      audio_url text not null unique,
      audio_title text not null default '',
      file_name text not null default '',
      uploaded_at timestamptz not null,
      next_notify_at timestamptz not null,
      last_notified_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);
}

function buildAudioRefreshMessage(row) {
  const title = row.audio_title || row.file_name || "аудио";
  return `Пора обновить аудио в библиотеке: ${title}. Прошло 14 дней после последней загрузки/напоминания.`;
}

function isDbConfigured(deps) {
  return deps.isPostgresConfigured ? deps.isPostgresConfigured() : isPostgresConfigured();
}
