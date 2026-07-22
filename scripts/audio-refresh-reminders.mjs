import { isPostgresConfigured, queryPostgres } from "./postgres-client.mjs";
import { sendTelegramMessage } from "./telegram-notifier.mjs";
import { defaultAppStateKey } from "./app-state-lock.mjs";
import { ensureStateSchema } from "./state-schema.mjs";
import {
  countAudioLibraryAssets,
  createAudioLibraryFingerprint,
  inferAudioLibraryChangedAt
} from "./audio-library-fingerprint.mjs";

const reminderDays = 14;
const reminderMs = reminderDays * 24 * 60 * 60 * 1000;
const defaultAudioLibraryFormatLabel = "формата 5 сек";
let schedulerStarted = false;

export async function registerAudioRefreshReminder(audio, deps = {}) {
  return syncAudioLibraryRefreshReminder([audio], deps);
}

export async function markAudioLibraryUpdated(deps = {}) {
  if (deps.audioLibrary) {
    const result = await syncAudioLibraryRefreshReminder(deps.audioLibrary, {
      ...deps,
      changedAt: deps.updatedAt || deps.changedAt || deps.now
    });
    return { marked: result.registered, nextNotifyAt: result.nextNotifyAt };
  }
  const result = await syncAudioLibraryRefreshReminderFromDatabase({
    ...deps,
    changedAt: deps.updatedAt || deps.changedAt || deps.now
  });
  return { marked: !result.skipped, nextNotifyAt: null };
}

export function hasAudioLibraryChanged(previousState = {}, nextState = {}) {
  return createAudioLibraryFingerprint(previousState?.audioLibrary || [])
    !== createAudioLibraryFingerprint(nextState?.audioLibrary || []);
}

export async function syncAudioLibraryRefreshReminder(audioLibrary = [], deps = {}) {
  if (!isDbConfigured(deps)) return { registered: false, reason: "postgres_not_configured" };
  const query = deps.query || queryPostgres;
  const appStateKey = deps.appStateKey || defaultAppStateKey;
  const now = toIsoDate(deps.now || new Date());
  const changedAt = toIsoDate(deps.changedAt || inferAudioLibraryChangedAt(audioLibrary, now));
  const fingerprint = createAudioLibraryFingerprint(audioLibrary);
  const assetCount = countAudioLibraryAssets(audioLibrary);

  await ensureAudioLibraryReminderTables(query);
  const current = await query(
    `select library_fingerprint, asset_count
       from studio_audio_library_refresh_reminders
      where app_state_key = $1
      limit 1`,
    [appStateKey]
  );
  const row = current.rows[0];
  if (row?.library_fingerprint === fingerprint && Number(row.asset_count || 0) === assetCount) {
    return { registered: true, changed: false, nextNotifyAt: null };
  }

  const nextNotifyAt = assetCount > 0 ? new Date(new Date(changedAt).getTime() + reminderMs).toISOString() : null;
  await query(
    `insert into studio_audio_library_refresh_reminders
      (app_state_key, library_fingerprint, asset_count, library_updated_at, next_notify_at, last_notified_at, last_notified_fingerprint, created_at, updated_at)
     values ($1, $2, $3, $4, $5, null, '', now(), now())
     on conflict (app_state_key) do update set
       library_fingerprint = excluded.library_fingerprint,
       asset_count = excluded.asset_count,
       library_updated_at = excluded.library_updated_at,
       next_notify_at = excluded.next_notify_at,
       last_notified_at = null,
       last_notified_fingerprint = '',
       updated_at = now()`,
    [appStateKey, fingerprint, assetCount, changedAt, nextNotifyAt]
  );
  return { registered: true, changed: true, nextNotifyAt };
}

export async function syncAudioLibraryRefreshReminderFromDatabase(deps = {}) {
  if (!isDbConfigured(deps)) return { synced: 0, skipped: true };
  const query = deps.query || queryPostgres;
  await ensureAudioLibraryReminderTables(query);
  const result = await query(
    `select app_state_key, id, title, file_name, file_type, file_size, file_data, created_at, updated_at
       from studio_global_audio_assets
      order by app_state_key asc, id asc`
  );
  const libraries = groupAudioAssetsByStateKey(result.rows);
  let synced = 0;
  for (const [appStateKey, audioLibrary] of libraries.entries()) {
    await syncAudioLibraryRefreshReminder(audioLibrary, {
      ...deps,
      query,
      appStateKey,
      changedAt: deps.changedAt || inferAudioLibraryChangedAt(audioLibrary, deps.now || new Date())
    });
    synced += 1;
  }
  return { synced, skipped: false };
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
  await ensureAudioLibraryReminderTables(query);
  if (deps.syncFromDatabase !== false) await syncAudioLibraryRefreshReminderFromDatabase({ ...deps, query });
  const due = await query(
    `update studio_audio_library_refresh_reminders
        set next_notify_at = now() + interval '1 hour',
            updated_at = now()
      where app_state_key in (
        select app_state_key
          from studio_audio_library_refresh_reminders
         where asset_count > 0
           and next_notify_at is not null
           and next_notify_at <= now()
         order by next_notify_at asc
         limit 20
      )
      returning app_state_key, library_fingerprint, asset_count, library_updated_at, next_notify_at`
  );
  for (const row of due.rows) {
    await sendMessage(buildAudioLibraryRefreshMessage(row, deps));
    await query(
      `update studio_audio_library_refresh_reminders
          set last_notified_at = now(),
              last_notified_fingerprint = library_fingerprint,
              next_notify_at = now() + interval '14 days',
              updated_at = now()
        where app_state_key = $1
          and library_fingerprint = $2`,
      [row.app_state_key, row.library_fingerprint]
    );
  }
  return { processed: due.rows.length, skipped: false };
}

export async function processAudioLibraryRefreshReminder(deps = {}) {
  return processAudioRefreshReminders(deps);
}

export async function ensureAudioLibraryReminderTables(query = queryPostgres) {
  await ensureStateSchema(query);
  await query(`
    create table if not exists studio_audio_library_refresh_reminders (
      app_state_key text primary key,
      library_fingerprint text not null default '',
      asset_count integer not null default 0,
      library_updated_at timestamptz not null,
      next_notify_at timestamptz,
      last_notified_at timestamptz,
      last_notified_fingerprint text not null default '',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);
  await ensureAudioReminderTable(query);
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

export function buildAudioLibraryRefreshMessage(row, deps = {}) {
  const count = Number(row.asset_count || 0);
  const suffix = count === 1 ? "1 файл" : `${count} файлов`;
  const formatLabel = getAudioLibraryFormatLabel(deps);
  return `Пора обновить аудио в библиотеке ${formatLabel}: она не обновлялась 14 дней (${suffix}).`;
}

export async function processLegacyAudioRefreshReminders() {
  return { processed: 0, skipped: true, reason: "legacy_audio_reminders_disabled" };
}

function groupAudioAssetsByStateKey(rows = []) {
  const libraries = new Map();
  rows.forEach((row) => {
    const appStateKey = row.app_state_key || defaultAppStateKey;
    const library = libraries.get(appStateKey) || [];
    library.push(audioFromAssetRow(row));
    libraries.set(appStateKey, library);
  });
  return libraries;
}

function audioFromAssetRow(row) {
  return {
    id: row.id,
    title: row.title,
    fileName: row.file_name,
    fileType: row.file_type,
    fileSize: row.file_size,
    fileData: row.file_data,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toIsoDate(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

function getAudioLibraryFormatLabel(deps = {}) {
  return String(deps.formatLabel || process.env.AUDIO_LIBRARY_FORMAT_LABEL || defaultAudioLibraryFormatLabel).trim()
    || defaultAudioLibraryFormatLabel;
}

function isDbConfigured(deps) {
  return deps.isPostgresConfigured ? deps.isPostgresConfigured() : isPostgresConfigured();
}
