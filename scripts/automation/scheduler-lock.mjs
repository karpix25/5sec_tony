import { defaultAppStateKey, withAppStateRetry } from "../app-state-lock.mjs";
import { isPostgresConfigured, withPostgresClient } from "../postgres-client.mjs";

export const defaultAutomationSchedulerLockKey = `${defaultAppStateKey}:automation-scheduler`;

export async function withAutomationSchedulerLock(run, options = {}) {
  const deps = options.deps || {};
  const configured = deps.isPostgresConfigured || isPostgresConfigured;
  if (!configured()) throw new Error("Postgres is not configured");
  const withClient = deps.withPostgresClient || withPostgresClient;
  const lockKey = options.lockKey || defaultAutomationSchedulerLockKey;
  return withAppStateRetry(() => withClient(async (client) => {
    const locked = await client.query("select pg_try_advisory_lock(hashtext($1)) as locked", [lockKey]);
    if (locked.rows[0]?.locked !== true) return { skipped: true, reason: "scheduler_lock_busy" };
    try {
      return await run();
    } finally {
      await client.query("select pg_advisory_unlock(hashtext($1))", [lockKey]);
    }
  }));
}

export async function tryLockAutomationScheduler(query, key = defaultAutomationSchedulerLockKey) {
  const result = await query("select pg_try_advisory_xact_lock(hashtext($1)) as locked", [key]);
  return result.rows[0]?.locked === true;
}
