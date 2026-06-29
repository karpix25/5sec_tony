import test from "node:test";
import assert from "node:assert/strict";
import {
  processAudioRefreshReminders,
  registerAudioRefreshReminder
} from "../scripts/audio-refresh-reminders.mjs";
import { getTelegramNotifyChatIds, sendTelegramMessage } from "../scripts/telegram-notifier.mjs";

test("audio reminder registration stores next notification two weeks after upload", async () => {
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
  assert.equal(queries.some((entry) => /create table if not exists studio_audio_refresh_reminders/i.test(entry.text)), true);
  assert.equal(queries.some((entry) => /insert into studio_audio_refresh_reminders/i.test(entry.text)), true);
});

test("audio reminder processor sends telegram message and schedules next cycle", async () => {
  const sent = [];
  const queries = [];
  const query = async (text, params = []) => {
    queries.push({ text, params });
    if (/select id, audio_title/i.test(text)) {
      return { rows: [{ id: 7, audio_title: "Beat", file_name: "beat.mp3" }] };
    }
    return { rows: [] };
  };

  const result = await processAudioRefreshReminders({
    query,
    isPostgresConfigured: () => true,
    sendTelegramMessage: async (message) => {
      sent.push(message);
      return { sent: 1 };
    }
  });

  assert.deepEqual(result, { processed: 1, skipped: false });
  assert.match(sent[0], /Пора обновить аудио/);
  assert.equal(queries.some((entry) => /next_notify_at = now\(\) \+ interval '14 days'/i.test(entry.text)), true);
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
