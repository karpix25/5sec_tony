import crypto from "node:crypto";

const defaultMaxAgeSeconds = 24 * 60 * 60;

export function parseTelegramInitData(initData) {
  if (!initData || typeof initData !== "string") {
    throw new Error("Telegram initData is required");
  }
  const params = new URLSearchParams(initData);
  const fields = {};
  for (const [key, value] of params.entries()) {
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      throw new Error(`Duplicate Telegram initData field: ${key}`);
    }
    fields[key] = value;
  }
  if (!fields.hash) throw new Error("Telegram initData hash is required");
  return fields;
}

export function verifyTelegramInitData(initData, options = {}) {
  const botToken = options.botToken || process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) throw new Error("TELEGRAM_BOT_TOKEN is required");

  const fields = parseTelegramInitData(initData);
  const expectedHash = fields.hash;
  const dataCheckString = createDataCheckString(fields);
  const actualHash = createTelegramHash(dataCheckString, botToken);

  if (!safeEqualHex(actualHash, expectedHash)) {
    throw new Error("Telegram initData hash is invalid");
  }
  assertFreshAuthDate(fields.auth_date, options);

  return {
    fields,
    user: extractTelegramUser(fields),
    authDate: Number(fields.auth_date)
  };
}

export function extractTelegramUser(fields) {
  if (!fields?.user) throw new Error("Telegram user payload is required");
  let user;
  try {
    user = JSON.parse(fields.user);
  } catch (error) {
    throw new Error("Telegram user payload is invalid JSON");
  }
  if (!user || typeof user !== "object" || !user.id) {
    throw new Error("Telegram user id is required");
  }
  return {
    id: String(user.id),
    firstName: stringOrNull(user.first_name),
    lastName: stringOrNull(user.last_name),
    username: stringOrNull(user.username),
    photoUrl: stringOrNull(user.photo_url),
    languageCode: stringOrNull(user.language_code),
    raw: user
  };
}

export function createDataCheckString(fields) {
  return Object.entries(fields)
    .filter(([key]) => key !== "hash" && key !== "signature")
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

export function createTelegramHash(dataCheckString, botToken) {
  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  return crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
}

function assertFreshAuthDate(authDate, options) {
  const timestamp = Number(authDate);
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    throw new Error("Telegram auth_date is invalid");
  }
  const nowSeconds = Math.floor((options.nowMs ?? Date.now()) / 1000);
  const maxAgeSeconds = Number(options.maxAgeSeconds ?? defaultMaxAgeSeconds);
  if (maxAgeSeconds > 0 && nowSeconds - timestamp > maxAgeSeconds) {
    throw new Error("Telegram initData is expired");
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
