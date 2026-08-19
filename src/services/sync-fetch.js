const defaultAttempts = 3;
const defaultTimeoutMs = 15000;
const retryBaseDelayMs = 350;

export async function fetchJsonWithRetry(url, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const attempts = Number(options.attempts || (method === "POST" ? 1 : defaultAttempts));
  const timeoutMs = Number(options.timeoutMs || defaultTimeoutMs);
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchWithTimeout(url, options, timeoutMs);
      const payload = await readJsonPayload(response);
      if (!shouldRetryResponse(response) || attempt === attempts) return { response, payload };
      lastError = new Error(payload.error || `Request failed: ${response.status}`);
    } catch (error) {
      lastError = error;
      if (!isRetryableError(error) || attempt === attempts) throw error;
    }
    await wait(retryBaseDelayMs * attempt);
  }
  throw lastError || new Error("Request failed");
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (timedOut) {
      const timeoutError = new Error(`Request timed out after ${timeoutMs} ms`);
      timeoutError.name = "TimeoutError";
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function readJsonPayload(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function shouldRetryResponse(response) {
  return response.status === 408 || response.status === 429 || response.status >= 500;
}

export function isTransientFetchError(error) {
  return error?.name === "AbortError"
    || error?.name === "TimeoutError"
    || /failed to fetch|network|load failed|fetch|timed out/i.test(String(error?.message || ""));
}

function isRetryableError(error) {
  return isTransientFetchError(error);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
