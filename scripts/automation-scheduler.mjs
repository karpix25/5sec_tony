import { runLockedAutomationSchedulerOnce } from "./automation/scheduler-tick.mjs";

const defaultIntervalMs = 60_000;
const defaultStaleBriefMs = 45 * 60 * 1000;

if (isMainModule(import.meta.url)) {
  startAutomationSchedulerFromEnv().catch((error) => {
    console.error(`[automation-scheduler:fatal] ${error.stack || error.message || error}`);
    process.exitCode = 1;
  });
}

export async function startAutomationSchedulerFromEnv(env = process.env) {
  const once = process.argv.includes("--once") || env.AUTOMATION_SCHEDULER_ONCE === "true";
  const scheduler = createAutomationScheduler({
    intervalMs: Number(env.AUTOMATION_SCHEDULER_INTERVAL_MS || defaultIntervalMs),
    staleBriefMs: Number(env.AUTOMATION_STALE_BRIEF_MS || defaultStaleBriefMs),
    once,
    env,
    logger: console
  });
  return scheduler.start();
}

export function createAutomationScheduler(options = {}) {
  const intervalMs = Math.max(5_000, Number(options.intervalMs || defaultIntervalMs));
  const logger = options.logger || console;
  let stopped = false;

  return {
    stop() {
      stopped = true;
    },
    async start() {
      logger.log(`[automation-scheduler] started intervalMs=${intervalMs}`);
      do {
        await runOnce(options, logger);
        if (options.once || stopped) break;
        await sleep(intervalMs);
      } while (!stopped);
      logger.log("[automation-scheduler] stopped");
    }
  };
}

async function runOnce(options, logger) {
  try {
    const result = await runLockedAutomationSchedulerOnce({
      deps: options.deps || {},
      env: options.env || process.env,
      staleBriefTimeoutMs: options.staleBriefMs,
      now: options.now
    });
    logger.log(`[automation-scheduler] cycle ${JSON.stringify(summarizeSchedulerResult(result))}`);
  } catch (error) {
    logger.error(`[automation-scheduler:error] ${error.stack || error.message || error}`);
  }
}

function summarizeSchedulerResult(result = {}) {
  const results = result.results || [];
  return {
    skipped: result.skipped === true,
    reason: result.reason || "",
    rescued: Number(result.rescued || 0),
    dispatches: Array.isArray(result.dispatches) ? result.dispatches.length : 0,
    ok: results.filter((item) => item.ok).length,
    failed: results.filter((item) => !item.ok).length,
    queueError: result.queueError || "",
    projects: results.map((item) => ({
      projectId: item.projectId || "",
      ok: item.ok === true,
      count: Number(item.count || 0),
      batchId: item.batchId || "",
      error: item.error || ""
    }))
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isMainModule(url) {
  return url === `file://${process.argv[1]}`;
}
