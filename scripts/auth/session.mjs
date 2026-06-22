import crypto from "node:crypto";

export const sessionCookieName = "anton_auth_session";
export const defaultSessionMaxAgeSeconds = 7 * 24 * 60 * 60;

export function createSessionCookie(session, options = {}) {
  const maxAgeSeconds = Number(options.maxAgeSeconds ?? defaultSessionMaxAgeSeconds);
  const issuedAt = Math.floor((options.nowMs ?? Date.now()) / 1000);
  const payload = {
    ...session,
    iat: issuedAt,
    exp: issuedAt + maxAgeSeconds
  };
  const value = signSessionPayload(payload, options);
  return serializeCookie(sessionCookieName, value, {
    maxAgeSeconds,
    httpOnly: true,
    sameSite: "Lax",
    secure: options.secure ?? process.env.NODE_ENV === "production",
    path: "/"
  });
}

export function clearSessionCookie(options = {}) {
  return serializeCookie(sessionCookieName, "", {
    maxAgeSeconds: 0,
    httpOnly: true,
    sameSite: "Lax",
    secure: options.secure ?? process.env.NODE_ENV === "production",
    path: "/"
  });
}

export function readSessionFromCookie(cookieHeader, options = {}) {
  const value = parseCookies(cookieHeader)[sessionCookieName];
  if (!value) return null;
  const session = verifySessionValue(value, options);
  if (!session) return null;
  const nowSeconds = Math.floor((options.nowMs ?? Date.now()) / 1000);
  if (!Number.isFinite(session.exp) || session.exp <= nowSeconds) return null;
  return session;
}

export function signSessionPayload(payload, options = {}) {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = hmacHex(encodedPayload, getSessionSecret(options));
  return `${encodedPayload}.${signature}`;
}

export function verifySessionValue(value, options = {}) {
  const [encodedPayload, signature, extra] = String(value || "").split(".");
  if (!encodedPayload || !signature || extra !== undefined) return null;
  const expected = hmacHex(encodedPayload, getSessionSecret(options));
  if (!safeEqualHex(expected, signature)) return null;
  try {
    return JSON.parse(base64UrlDecode(encodedPayload).toString("utf8"));
  } catch (error) {
    return null;
  }
}

export function getSessionSecret(options = {}) {
  const secret = options.secret || process.env.AUTH_SESSION_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SESSION_SECRET is required in production");
  }
  return "dev-only-auth-session-secret";
}

export function parseCookies(cookieHeader) {
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

function hmacHex(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value) {
  return Buffer.from(value, "base64url");
}

function safeEqualHex(left, right) {
  if (typeof right !== "string" || !/^[a-f0-9]+$/i.test(right)) return false;
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}
