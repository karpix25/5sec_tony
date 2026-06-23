import crypto from "node:crypto";
import { signSessionPayload, verifySessionValue } from "./session.mjs";

const oidcCookieName = "anton_oidc_state";
const oidcMaxAgeSeconds = 10 * 60;

export function createOidcState() {
  return randomBase64Url(32);
}

export function createCodeVerifier() {
  return randomBase64Url(48);
}

export function createCodeChallenge(verifier) {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

export function createOidcStateCookie(payload, options = {}) {
  const nowSeconds = Math.floor((options.nowMs ?? Date.now()) / 1000);
  const value = signSessionPayload({
    ...payload,
    exp: nowSeconds + oidcMaxAgeSeconds
  }, options);
  return serializeCookie(oidcCookieName, value, {
    maxAgeSeconds: oidcMaxAgeSeconds,
    httpOnly: true,
    sameSite: "Lax",
    secure: options.secure ?? process.env.NODE_ENV === "production",
    path: "/"
  });
}

export function readOidcStateCookie(cookieHeader, options = {}) {
  const value = parseCookies(cookieHeader)[oidcCookieName];
  if (!value) return null;
  const payload = verifySessionValue(value, options);
  const nowSeconds = Math.floor((options.nowMs ?? Date.now()) / 1000);
  if (!payload?.exp || payload.exp <= nowSeconds) return null;
  return payload;
}

export function clearOidcStateCookie(options = {}) {
  return serializeCookie(oidcCookieName, "", {
    maxAgeSeconds: 0,
    httpOnly: true,
    sameSite: "Lax",
    secure: options.secure ?? process.env.NODE_ENV === "production",
    path: "/"
  });
}

export function normalizeReturnTo(value) {
  const fallback = "/";
  if (!value || typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
}

function randomBase64Url(bytes) {
  return crypto.randomBytes(bytes).toString("base64url");
}

function parseCookies(cookieHeader) {
  const cookies = {};
  for (const part of String(cookieHeader || "").split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    if (!key) continue;
    cookies[key] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return cookies;
}

function serializeCookie(name, value, options) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAgeSeconds !== undefined) parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAgeSeconds))}`);
  if (options.path) parts.push(`Path=${options.path}`);
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  return parts.join("; ");
}
