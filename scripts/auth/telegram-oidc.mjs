import crypto from "node:crypto";

const issuer = "https://oauth.telegram.org";
const authEndpoint = `${issuer}/auth`;
const tokenEndpoint = `${issuer}/token`;
const jwksEndpoint = `${issuer}/.well-known/jwks.json`;

export function getTelegramOidcConfig(options = {}) {
  const clientId = options.clientId || process.env.TELEGRAM_CLIENT_ID || process.env.TELEGRAM_BOT_ID;
  const clientSecret = options.clientSecret || process.env.TELEGRAM_CLIENT_SECRET;
  if (!clientId) throw new Error("TELEGRAM_CLIENT_ID is required");
  if (!clientSecret) throw new Error("TELEGRAM_CLIENT_SECRET is required");
  return {
    clientId: String(clientId),
    clientSecret: String(clientSecret),
    scope: options.scope || process.env.TELEGRAM_OIDC_SCOPE || "openid profile"
  };
}

export function getRedirectUri(request, options = {}) {
  if (options.redirectUri || process.env.TELEGRAM_OIDC_REDIRECT_URI) {
    return options.redirectUri || process.env.TELEGRAM_OIDC_REDIRECT_URI;
  }
  const protocol = request.headers?.["x-forwarded-proto"] || "https";
  const host = request.headers?.["x-forwarded-host"] || request.headers?.host;
  if (!host) throw new Error("Request host is required for Telegram OIDC redirect URI");
  return `${protocol}://${host}/api/auth/telegram/callback`;
}

export function buildAuthorizationUrl({ clientId, redirectUri, scope, state, codeChallenge }) {
  const url = new URL(authEndpoint);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", scope || "openid profile");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export async function exchangeTelegramCode({ code, redirectUri, codeVerifier }, options = {}) {
  const config = getTelegramOidcConfig(options);
  const fetchImpl = options.fetch || fetch;
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: config.clientId,
    code_verifier: codeVerifier
  });
  const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
  const response = await fetchImpl(tokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`
    },
    body
  });
  const payload = await readTokenResponse(response);
  if (!payload.id_token) throw new Error("Telegram token response is missing id_token");
  return payload;
}

export async function verifyTelegramIdToken(idToken, options = {}) {
  const config = getTelegramOidcConfig(options);
  const [encodedHeader, encodedPayload, encodedSignature] = String(idToken || "").split(".");
  if (!encodedHeader || !encodedPayload || !encodedSignature) throw new Error("Telegram id_token is invalid");
  const header = parseJwtPart(encodedHeader);
  const claims = parseJwtPart(encodedPayload);
  if (header.alg !== "RS256") throw new Error("Unsupported Telegram id_token algorithm");
  const key = await resolveTelegramJwk(header.kid, options);
  const valid = crypto.verify(
    "RSA-SHA256",
    Buffer.from(`${encodedHeader}.${encodedPayload}`),
    crypto.createPublicKey({ key, format: "jwk" }),
    Buffer.from(encodedSignature, "base64url")
  );
  if (!valid) throw new Error("Telegram id_token signature is invalid");
  assertTelegramClaims(claims, config.clientId, options);
  return claims;
}

export function extractTelegramOidcUser(claims = {}) {
  const id = claims.id || claims.sub;
  if (!id) throw new Error("Telegram id_token user id is missing");
  const [firstName, ...rest] = String(claims.name || "").trim().split(/\s+/).filter(Boolean);
  return {
    id: String(id),
    firstName: firstName || null,
    lastName: rest.join(" ") || null,
    username: stringOrNull(claims.preferred_username),
    photoUrl: stringOrNull(claims.picture),
    languageCode: null,
    raw: claims
  };
}

async function resolveTelegramJwk(kid, options = {}) {
  if (options.jwks?.keys) {
    return findJwk(options.jwks.keys, kid);
  }
  const fetchImpl = options.fetch || fetch;
  const response = await fetchImpl(jwksEndpoint, { method: "GET" });
  if (!response.ok) throw new Error("Failed to fetch Telegram JWKS");
  const payload = await response.json();
  return findJwk(payload.keys || [], kid);
}

function findJwk(keys, kid) {
  const key = keys.find((item) => item.kid === kid) || keys[0];
  if (!key) throw new Error("Telegram JWKS key not found");
  return key;
}

function assertTelegramClaims(claims, clientId, options = {}) {
  if (claims.iss !== issuer) throw new Error("Telegram id_token issuer is invalid");
  const audience = Array.isArray(claims.aud) ? claims.aud.map(String) : [String(claims.aud || "")];
  if (!audience.includes(String(clientId))) throw new Error("Telegram id_token audience is invalid");
  const nowSeconds = Math.floor((options.nowMs ?? Date.now()) / 1000);
  if (!Number.isFinite(Number(claims.exp)) || Number(claims.exp) <= nowSeconds) {
    throw new Error("Telegram id_token is expired");
  }
}

async function readTokenResponse(response) {
  let payload = {};
  try {
    payload = await response.json();
  } catch {}
  if (!response.ok) {
    throw new Error(payload.error_description || payload.error || "Telegram token exchange failed");
  }
  return payload;
}

function parseJwtPart(value) {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    throw new Error("Telegram id_token payload is invalid");
  }
}

function stringOrNull(value) {
  return typeof value === "string" && value.trim() ? value : null;
}
