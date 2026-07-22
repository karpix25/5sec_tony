import test from "node:test";
import assert from "node:assert/strict";
import {
  hasAudioLibraryChanged,
  markAudioLibraryUpdated,
  processAudioRefreshReminders,
  processLegacyAudioRefreshReminders,
  registerAudioRefreshReminder,
  syncAudioLibraryRefreshReminder
} from "../scripts/audio-refresh-reminders.mjs";
import { createAudioLibraryFingerprint } from "../scripts/audio-library-fingerprint.mjs";
import { getTelegramNotifyChatIds, sendTelegramMessage } from "../scripts/telegram-notifier.mjs";

test("audio library reminder registration stores one global next notification", async () => {
  const queries = [];
  const query = async (text, params = []) => {
    queries.push({ text, params });
    return { rows: [] };
  };

  const result = await registerAudioRefreshReminder({
    url: "https://cdn.example.com/audio.mp3",
    title: "Beat",
    fileName: "beat.mp3",
    uploadedAt: "2026-06-29T10:00:00.000Z"
  }, { query, isPostgresConfigured: () => true });

  assert.equal(result.registered, true);
  assert.equal(result.nextNotifyAt, "2026-07-13T10:00:00.000Z");
  assert.equal(queries.some((entry) => /create table if not exists studio_audio_library_refresh_reminders/i.test(entry.text)), true);
  assert.equal(queries.some((entry) => /insert into studio_audio_library_refresh_reminders/i.test(entry.text)), true);
});

test("audio reminder processor sends one telegram message for stale global library", async () => {
  const sent = [];
  const queries = [];
  const fingerprint = "library-v1";
  const query = async (text, params = []) => {
    queries.push({ text, params });
    if (/update studio_audio_library_refresh_reminders[\s\S]*returning app_state_key/i.test(text)) {
      return { rows: [{ app_state_key: "default", library_fingerprint: fingerprint, asset_count: 3 }] };
    }
    return { rows: [] };
  };

  const result = await processAudioRefreshReminders({
    query,
    isPostgresConfigured: () => true,
    syncFromDatabase: false,
    sendTelegramMessage: async (message) => {
      sent.push(message);
      return { sent: 1 };
    }
  });

  assert.deepEqual(result, { processed: 1, skipped: false });
  assert.equal(sent.length, 1);
  assert.match(sent[0], /Пора обновить аудио в библиотеке формата 5 сек/);
  assert.match(sent[0], /3 файлов/);
  assert.doesNotMatch(sent[0], /ReelAudio|beat\.mp3/i);
  assert.equal(queries.some((entry) => /next_notify_at = now\(\) \+ interval '14 days'/i.test(entry.text)), true);
  assert.equal(queries.some((entry) => entry.params?.[1] === fingerprint), true);
});


test("audio library reminder message can include a custom global format label", async () => {
  const sent = [];
  const result = await processAudioRefreshReminders({
    isPostgresConfigured: () => true,
    syncFromDatabase: false,
    formatLabel: "формата 5 сек",
    query: async (text) => {
      if (/update studio_audio_library_refresh_reminders[\s\S]*returning app_state_key/i.test(text)) {
        return { rows: [{ app_state_key: "default", library_fingerprint: "fp", asset_count: 1 }] };
      }
      return { rows: [] };
    },
    sendTelegramMessage: async (message) => {
      sent.push(message);
      return { sent: 1 };
    }
  });

  assert.deepEqual(result, { processed: 1, skipped: false });
  assert.equal(sent[0], "Пора обновить аудио в библиотеке формата 5 сек: она не обновлялась 14 дней (1 файл).");
});

test("audio reminder processor does not send for empty or not-due global library", async () => {
  const sent = [];
  const result = await processAudioRefreshReminders({
    syncFromDatabase: false,
    isPostgresConfigured: () => true,
    query: async (text) => {
      if (/update studio_audio_library_refresh_reminders[\s\S]*returning app_state_key/i.test(text)) return { rows: [] };
      return { rows: [] };
    },
    sendTelegramMessage: async (message) => sent.push(message)
  });

  assert.deepEqual(result, { processed: 0, skipped: false });
  assert.deepEqual(sent, []);
});

test("audio library reminder does not reset when persisted library is unchanged", async () => {
  const library = [{ id: "audio-1", fileData: "https://cdn.example.com/beat.mp3", createdAt: "2026-07-01T12:00:00.000Z" }];
  const fingerprint = createAudioLibraryFingerprint(library);
  const writes = [];
  const result = await syncAudioLibraryRefreshReminder(library, {
    isPostgresConfigured: () => true,
    query: async (text, params = []) => {
      if (/select library_fingerprint, asset_count/i.test(text)) return { rows: [{ library_fingerprint: fingerprint, asset_count: 1 }] };
      if (/insert into studio_audio_library_refresh_reminders/i.test(text)) writes.push({ text, params });
      return { rows: [] };
    }
  });

  assert.deepEqual(result, { registered: true, changed: false, nextNotifyAt: null });
  assert.equal(writes.length, 0);
});

test("audio library reminder resets after the global library changes", async () => {
  const queries = [];
  const result = await syncAudioLibraryRefreshReminder([
    { id: "audio-1", fileData: "https://cdn.example.com/new.mp3", createdAt: "2026-07-01T12:00:00.000Z" }
  ], {
    isPostgresConfigured: () => true,
    now: "2026-07-01T12:00:00.000Z",
    query: async (text, params = []) => {
      queries.push({ text, params });
      if (/select library_fingerprint, asset_count/i.test(text)) return { rows: [{ library_fingerprint: "old", asset_count: 1 }] };
      return { rows: [] };
    }
  });

  assert.equal(result.changed, true);
  assert.equal(result.nextNotifyAt, "2026-07-15T12:00:00.000Z");
  assert.equal(queries.some((entry) => /last_notified_at = null/i.test(entry.text)), true);
});

test("markAudioLibraryUpdated can mark a supplied global library", async () => {
  const result = await markAudioLibraryUpdated({
    isPostgresConfigured: () => true,
    updatedAt: "2026-07-01T12:00:00.000Z",
    audioLibrary: [{ id: "audio-1", fileData: "https://cdn.example.com/beat.mp3" }],
    query: async (text) => {
      if (/select library_fingerprint, asset_count/i.test(text)) return { rows: [] };
      return { rows: [] };
    }
  });

  assert.deepEqual(result, { marked: true, nextNotifyAt: "2026-07-15T12:00:00.000Z" });
});

test("audio library change detector treats the whole library as one resource", () => {
  const previous = { audioLibrary: [{ id: "audio-1", fileData: "https://cdn.example.com/old.mp3", title: "Old" }] };
  const same = { audioLibrary: [{ id: "audio-1", fileData: "https://cdn.example.com/old.mp3", title: "Old" }] };
  const replaced = { audioLibrary: [{ id: "audio-1", fileData: "https://cdn.example.com/new.mp3", title: "Old" }] };
  const deleted = { audioLibrary: [] };

  assert.equal(hasAudioLibraryChanged(previous, same), false);
  assert.equal(hasAudioLibraryChanged(previous, replaced), true);
  assert.equal(hasAudioLibraryChanged(previous, deleted), true);
});


test("legacy per-file audio reminders are disabled", async () => {
  const sent = [];
  const queries = [];
  const result = await processLegacyAudioRefreshReminders({
    isPostgresConfigured: () => true,
    query: async (text) => {
      queries.push(text);
      return { rows: [{ id: 1, file_name: "ReelAudio-3022.mp3" }] };
    },
    sendTelegramMessage: async (message) => sent.push(message)
  });

  assert.deepEqual(result, { processed: 0, skipped: true, reason: "legacy_audio_reminders_disabled" });
  assert.deepEqual(sent, []);
  assert.deepEqual(queries, []);
});

test("telegram notifier sends messages to configured chats", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), body: JSON.parse(options.body) });
    return { ok: true, text: async () => "" };
  };

  try {
    const result = await sendTelegramMessage("Привет", {
      botToken: "123:test",
      chatIds: ["111", "222"]
    });

    assert.deepEqual(result, { sent: 2, skipped: false });
    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, "https://api.telegram.org/bot123:test/sendMessage");
    assert.deepEqual(calls.map((call) => call.body.chat_id), ["111", "222"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("telegram notify chat ids can be parsed from env-style list", () => {
  assert.deepEqual(getTelegramNotifyChatIds("111, 222\n333"), ["111", "222", "333"]);
});
