const defaultAttempts = 6;
const defaultBaseDelayMs = 750;
const defaultMaxDelayMs = 7000;

let mutationTail = Promise.resolve();

export async function withYandexDiskMutationLock(operation) {
  const previous = mutationTail.catch(() => {});
  let release;
  mutationTail = new Promise((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await operation();
  } finally {
    release();
  }
}

export async function withYandexDiskRetry(operation, options = {}) {
  const attempts = normalizePositiveInteger(options.attempts, defaultAttempts);
  const baseDelayMs = normalizePositiveInteger(process.env.YANDEX_DISK_RETRY_BASE_MS, options.baseDelayMs || defaultBaseDelayMs);
  const maxDelayMs = normalizePositiveInteger(options.maxDelayMs, defaultMaxDelayMs);
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation({ attempt });
    } catch (error) {
      lastError = error;
      if (attempt >= attempts || !isYandexDiskRetryableError(error)) throw error;
      await sleep(getRetryDelayMs(attempt, baseDelayMs, maxDelayMs));
    }
  }

  throw lastError;
}

export function createYandexDiskError(message, options = {}) {
  const error = new Error(message || "Ошибка Яндекс.Диска");
  error.status = options.status;
  error.payload = options.payload;
  error.retryable = Boolean(options.retryable) || isRetryableStatus(options.status) || isRetryableMessage(message);
  return error;
}

function isYandexDiskRetryableError(error) {
  return Boolean(error?.retryable) || isRetryableStatus(error?.status) || isRetryableMessage(error?.message);
}

function isRetryableStatus(status) {
  return [408, 409, 423, 425, 429, 500, 502, 503, 504].includes(Number(status));
}

function isRetryableMessage(message) {
  return /ресурс заблокирован|resource.*locked|locked|too many requests|timeout|temporar|временно|econnreset|socket hang up|не вернул публичную ссылку|ещ[её] не вернул публичную ссылку/i.test(String(message || ""));
}

function getRetryDelayMs(attempt, baseDelayMs, maxDelayMs) {
  return Math.min(maxDelayMs, baseDelayMs * 2 ** Math.max(0, attempt - 1));
}

function normalizePositiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
