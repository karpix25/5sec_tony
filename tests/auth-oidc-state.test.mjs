import test from "node:test";
import assert from "node:assert/strict";
import {
  createCodeChallenge,
  createOidcStateCookie,
  normalizeReturnTo,
  readOidcStateCookie
} from "../scripts/auth/oidc-state.mjs";

test("oidc state cookie stores signed pkce verifier", () => {
  const cookie = createOidcStateCookie({
    state: "state-1",
    codeVerifier: "verifier-1",
    redirectUri: "https://example.com/api/auth/telegram/callback",
    returnTo: "/studio"
  }, {
    secret: "test-secret",
    nowMs: 1_800_000_000_000,
    secure: false
  });

  const payload = readOidcStateCookie(cookie, {
    secret: "test-secret",
    nowMs: 1_800_000_030_000
  });

  assert.equal(payload.state, "state-1");
  assert.equal(payload.codeVerifier, "verifier-1");
  assert.equal(payload.returnTo, "/studio");
});

test("creates S256 code challenge", () => {
  assert.equal(
    createCodeChallenge("abc"),
    "ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0"
  );
});

test("normalizes unsafe return targets", () => {
  assert.equal(normalizeReturnTo("/queue?x=1"), "/queue?x=1");
  assert.equal(normalizeReturnTo("https://evil.example"), "/");
  assert.equal(normalizeReturnTo("//evil.example"), "/");
});
