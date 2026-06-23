import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  buildAuthorizationUrl,
  extractTelegramOidcUser,
  verifyTelegramIdToken
} from "../scripts/auth/telegram-oidc.mjs";

test("builds Telegram OIDC authorization URL with PKCE", () => {
  const url = new URL(buildAuthorizationUrl({
    clientId: "123",
    redirectUri: "https://example.com/api/auth/telegram/callback",
    scope: "openid profile",
    state: "state",
    codeChallenge: "challenge"
  }));

  assert.equal(url.origin + url.pathname, "https://oauth.telegram.org/auth");
  assert.equal(url.searchParams.get("client_id"), "123");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
});

test("verifies Telegram OIDC id_token and extracts user", async () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = publicKey.export({ format: "jwk" });
  jwk.kid = "kid-1";
  jwk.alg = "RS256";
  const nowSeconds = 1_800_000_000;
  const token = signJwt({
    alg: "RS256",
    kid: "kid-1"
  }, {
    iss: "https://oauth.telegram.org",
    aud: "123",
    sub: "42",
    id: 42,
    name: "Anton Admin",
    preferred_username: "anton",
    picture: "https://cdn.example/avatar.jpg",
    exp: nowSeconds + 300
  }, privateKey);

  const claims = await verifyTelegramIdToken(token, {
    clientId: "123",
    clientSecret: "secret",
    jwks: { keys: [jwk] },
    nowMs: nowSeconds * 1000
  });
  const user = extractTelegramOidcUser(claims);

  assert.equal(user.id, "42");
  assert.equal(user.firstName, "Anton");
  assert.equal(user.lastName, "Admin");
  assert.equal(user.username, "anton");
});

function signJwt(header, payload, privateKey) {
  const encodedHeader = encodeJson(header);
  const encodedPayload = encodeJson(payload);
  const input = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto.sign("RSA-SHA256", Buffer.from(input), privateKey).toString("base64url");
  return `${input}.${signature}`;
}

function encodeJson(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}
