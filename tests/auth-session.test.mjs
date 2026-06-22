import test from "node:test";
import assert from "node:assert/strict";
import {
  createSessionCookie,
  readSessionFromCookie,
  sessionCookieName
} from "../scripts/auth/session.mjs";

test("creates and reads a signed httpOnly auth session cookie", () => {
  const cookie = createSessionCookie({ telegramId: "42", role: "admin" }, {
    secret: "test-secret",
    nowMs: 1_800_000_000_000,
    maxAgeSeconds: 60,
    secure: false
  });

  assert.match(cookie, new RegExp(`^${sessionCookieName}=`));
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);

  const session = readSessionFromCookie(cookie, {
    secret: "test-secret",
    nowMs: 1_800_000_030_000
  });
  assert.equal(session.telegramId, "42");
  assert.equal(session.role, "admin");
});

test("rejects tampered auth session cookies", () => {
  const cookie = createSessionCookie({ telegramId: "42" }, {
    secret: "test-secret",
    nowMs: 1_800_000_000_000
  });
  const [nameAndValue, ...attributes] = cookie.split("; ");
  const [name, value] = nameAndValue.split("=");
  const [payload, signature] = decodeURIComponent(value).split(".");
  const lastChar = signature.endsWith("0") ? "1" : "0";
  const tampered = `${name}=${encodeURIComponent(`${payload}.${signature.slice(0, -1)}${lastChar}`)}; ${attributes.join("; ")}`;

  assert.equal(readSessionFromCookie(tampered, {
    secret: "test-secret",
    nowMs: 1_800_000_010_000
  }), null);
});

test("rejects expired auth session cookies", () => {
  const cookie = createSessionCookie({ telegramId: "42" }, {
    secret: "test-secret",
    nowMs: 1_800_000_000_000,
    maxAgeSeconds: 10
  });

  assert.equal(readSessionFromCookie(cookie, {
    secret: "test-secret",
    nowMs: 1_800_000_011_000
  }), null);
});
