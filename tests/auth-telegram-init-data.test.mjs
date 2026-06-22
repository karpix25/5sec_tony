import test from "node:test";
import assert from "node:assert/strict";
import {
  createDataCheckString,
  createTelegramHash,
  verifyTelegramInitData
} from "../scripts/auth/telegram-init-data.mjs";

test("verifies Telegram Mini App initData and extracts user", () => {
  const botToken = "123456:test-token";
  const authDate = 1_800_000_000;
  const fields = {
    auth_date: String(authDate),
    query_id: "AAHdF6IQAAAAAN0XohDhrOrc",
    user: JSON.stringify({
      id: 42,
      first_name: "Anton",
      username: "anton"
    })
  };
  const hash = createTelegramHash(createDataCheckString(fields), botToken);
  const initData = new URLSearchParams({ ...fields, hash }).toString();

  const verified = verifyTelegramInitData(initData, {
    botToken,
    nowMs: (authDate + 60) * 1000
  });

  assert.equal(verified.user.id, "42");
  assert.equal(verified.user.firstName, "Anton");
  assert.equal(verified.user.username, "anton");
  assert.equal(verified.authDate, authDate);
});

test("rejects Telegram initData with invalid hash", () => {
  const authDate = 1_800_000_000;
  const fields = {
    auth_date: String(authDate),
    user: JSON.stringify({ id: 42 })
  };
  const initData = new URLSearchParams({ ...fields, hash: "0".repeat(64) }).toString();

  assert.throws(() => verifyTelegramInitData(initData, {
    botToken: "123456:test-token",
    nowMs: (authDate + 60) * 1000
  }), /hash is invalid/);
});

test("rejects expired Telegram initData", () => {
  const botToken = "123456:test-token";
  const authDate = 1_800_000_000;
  const fields = {
    auth_date: String(authDate),
    user: JSON.stringify({ id: 42 })
  };
  const hash = createTelegramHash(createDataCheckString(fields), botToken);
  const initData = new URLSearchParams({ ...fields, hash }).toString();

  assert.throws(() => verifyTelegramInitData(initData, {
    botToken,
    nowMs: (authDate + 120) * 1000,
    maxAgeSeconds: 60
  }), /expired/);
});
