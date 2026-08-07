export const defaultAppStateKey = process.env.APP_STATE_KEY || "default";

export async function lockAppState(query, key = defaultAppStateKey, scope = "") {
  await query("select pg_advisory_xact_lock(hashtext($1))", [scope ? `${key}:${scope}` : key]);
}

export async function withAppStateRetry(run, options = {}) {
  const maxAttempts = Math.max(1, Number(options.maxAttempts || 3));
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await run(attempt);
    } catch (error) {
      if (!isRetryablePostgresConcurrencyError(error) || attempt >= maxAttempts) throw error;
      await sleep(Number(options.delayMs || 100) * attempt);
    }
  }
}

export function isRetryablePostgresConcurrencyError(error) {
  return ["40P01", "40001"].includes(error?.code);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
