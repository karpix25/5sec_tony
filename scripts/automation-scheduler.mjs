import { runLockedAutomationSchedulerOnce } from "./automation/scheduler-tick.mjs";

const defaultIntervalMs = 60_000;
const defaultStaleBriefMs = 45 * 60 * 1000;

if (isMainModule(import.meta.url)) {
  startAutomationSchedulerFromEnv().catch((error) => {
    console.error(`[automation-scheduler:fatal] ${formatError(error)}`);
    process.exitCode = 1;
  });
}

export async function startAutomationSchedulerFromEnv(env = process.env) {
  const once = process.argv.includes("--once") || env.AUTOMATION_SCHEDULER_ONCE === "true";
  const scheduler = createAutomationScheduler({
    intervalMs: Number(env.AUTOMATION_SCHEDULER_INTERVAL_MS || defaultIntervalMs),
    staleBriefMs: Number(env.AUTOMATION_STALE_BRIEF_MS || defaultStaleBriefMs),
    dispatchTimeoutMs: Number(env.AUTOMATION_DISPATCH_TIMEOUT_MS || 30_000),
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
  let startPromise = null;

  return {
    stop() {
      stopped = true;
    },
    start() {
      if (startPromise) return startPromise;
      startPromise = runScheduler();
      return startPromise;
    }
  };

  async function runScheduler() {
    logger.log(`[automation-scheduler] started intervalMs=${intervalMs}`);
    do {
      await runOnce(options, logger);
      if (options.once || stopped) break;
      await sleep(intervalMs);
    } while (!stopped);
    logger.log("[automation-scheduler] stopped");
  }
}

async function runOnce(options, logger) {
  try {
    const result = await runLockedAutomationSchedulerOnce({
      deps: options.deps || {},
      env: options.env || process.env,
      staleBriefTimeoutMs: options.staleBriefMs,
      dispatchTimeoutMs: options.dispatchTimeoutMs,
      now: options.now
    });
    logger.log(`[automation-scheduler] cycle ${JSON.stringify(summarizeSchedulerResult(result))}`);
  } catch (error) {
    logger.error(`[automation-scheduler:error] ${formatError(error)}`);
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
    queueError: compactText(result.queueError),
    audioReminder: summarizeAudioReminder(result.audioLibraryReminder),
    projects: results.map((item) => ({
      projectId: item.projectId || "",
      ok: item.ok === true,
      count: Number(item.count || 0),
      batchId: item.batchId || "",
      error: compactText(item.error)
    }))
  };
}

function summarizeAudioReminder(reminder = {}) {
  return {
    processed: Number(reminder.processed || 0),
    skipped: reminder.skipped === true,
    reason: reminder.reason || "",
    error: reminder.error || ""
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatError(error) {
  const message = error?.message || String(error);
  return compactText(error?.code ? `${error.code}: ${message}` : message);
}

function compactText(value, limit = 500) {
  const text = String(value || "");
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

function isMainModule(url) {
  return url === `file://${process.argv[1]}`;
}
