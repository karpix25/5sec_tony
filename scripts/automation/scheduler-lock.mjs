import { defaultAppStateKey, withAppStateRetry } from "../app-state-lock.mjs";
import { isPostgresConfigured, withPostgresTransaction } from "../postgres-client.mjs";

export const defaultAutomationSchedulerLockKey = `${defaultAppStateKey}:automation-scheduler`;

export async function withAutomationSchedulerLock(run, options = {}) {
  const deps = options.deps || {};
  const configured = deps.isPostgresConfigured || isPostgresConfigured;
  if (!configured()) throw new Error("Postgres is not configured");
  const withTransaction = deps.withPostgresTransaction || withPostgresTransaction;
  return withAppStateRetry(() => withTransaction(async (tx) => {
    const locked = await tryLockAutomationScheduler(tx.query, options.lockKey || defaultAutomationSchedulerLockKey);
    if (!locked) return { skipped: true, reason: "scheduler_lock_busy" };
    return await run();
  }));
}

export async function tryLockAutomationScheduler(query, key = defaultAutomationSchedulerLockKey) {
  const result = await query("select pg_try_advisory_xact_lock(hashtext($1)) as locked", [key]);
  return result.rows[0]?.locked === true;
}
