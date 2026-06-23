import crypto from "node:crypto";

const defaultMaxAgeSeconds = 24 * 60 * 60;

export function verifyTelegramLoginWidgetUser(user, options = {}) {
  const botToken = options.botToken || process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) throw new Error("TELEGRAM_BOT_TOKEN is required");
  if (!user || typeof user !== "object") throw new Error("Telegram login user is required");
  if (!user.hash) throw new Error("Telegram login hash is required");

  const fields = normalizeWidgetFields(user);
  const actualHash = createWidgetHash(createWidgetDataCheckString(fields), botToken);
  if (!safeEqualHex(actualHash, String(user.hash))) {
    throw new Error("Telegram login hash is invalid");
  }
  assertFreshAuthDate(fields.auth_date, options);
  return {
    fields,
    user: extractWidgetUser(fields),
    authDate: Number(fields.auth_date)
  };
}

export function createWidgetDataCheckString(fields) {
  return Object.entries(fields)
    .filter(([key]) => key !== "hash")
    .filter(([, value]) => value !== undefined && value !== null && String(value) !== "")
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

export function createWidgetHash(dataCheckString, botToken) {
  const secretKey = crypto.createHash("sha256").update(botToken).digest();
  return crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
}

function normalizeWidgetFields(user) {
  const fields = {};
  for (const key of ["id", "first_name", "last_name", "username", "photo_url", "auth_date", "hash"]) {
    if (user[key] !== undefined && user[key] !== null && String(user[key]) !== "") {
      fields[key] = String(user[key]);
    }
  }
  if (!fields.id) throw new Error("Telegram login user id is required");
  if (!fields.auth_date) throw new Error("Telegram login auth_date is required");
  return fields;
}

function extractWidgetUser(fields) {
  return {
    id: String(fields.id),
    firstName: stringOrNull(fields.first_name),
    lastName: stringOrNull(fields.last_name),
    username: stringOrNull(fields.username),
    photoUrl: stringOrNull(fields.photo_url),
    languageCode: null,
    raw: fields
  };
}

function assertFreshAuthDate(authDate, options) {
  const timestamp = Number(authDate);
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    throw new Error("Telegram login auth_date is invalid");
  }
  const nowSeconds = Math.floor((options.nowMs ?? Date.now()) / 1000);
  const maxAgeSeconds = Number(options.maxAgeSeconds ?? defaultMaxAgeSeconds);
  if (maxAgeSeconds > 0 && nowSeconds - timestamp > maxAgeSeconds) {
    throw new Error("Telegram login data is expired");
  }
}

function safeEqualHex(left, right) {
  if (typeof right !== "string" || !/^[a-f0-9]+$/i.test(right)) return false;
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function stringOrNull(value) {
  return typeof value === "string" && value.trim() ? value : null;
}
