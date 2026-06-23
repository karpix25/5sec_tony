import test from "node:test";
import assert from "node:assert/strict";
import {
  createWidgetDataCheckString,
  createWidgetHash,
  verifyTelegramLoginWidgetUser
} from "../scripts/auth/telegram-login-widget.mjs";

test("verifies classic Telegram login widget payload", () => {
  const botToken = "123:secret";
  const nowSeconds = 1_800_000_000;
  const payload = {
    id: 42,
    first_name: "Anton",
    last_name: "Admin",
    username: "anton",
    auth_date: nowSeconds
  };
  const hash = createWidgetHash(createWidgetDataCheckString(payload), botToken);

  const verified = verifyTelegramLoginWidgetUser({ ...payload, hash }, {
    botToken,
    nowMs: nowSeconds * 1000
  });

  assert.equal(verified.user.id, "42");
  assert.equal(verified.user.firstName, "Anton");
  assert.equal(verified.user.lastName, "Admin");
  assert.equal(verified.user.username, "anton");
});

test("rejects classic Telegram login widget payload with invalid hash", () => {
  assert.throws(() => verifyTelegramLoginWidgetUser({
    id: 42,
    first_name: "Anton",
    auth_date: 1_800_000_000,
    hash: "bad"
  }, {
    botToken: "123:secret",
    nowMs: 1_800_000_000_000
  }), /hash is invalid/);
});
