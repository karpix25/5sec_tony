import { readFileSync } from "node:fs";
import { ensureJobQueueSchema } from "./job-queue-schema.mjs";
import { isPostgresConfigured, queryPostgres } from "./postgres-client.mjs";
import { getJobQueueName, getRedisConnection, shouldUseBullMq } from "./job-queue-dispatcher.mjs";

export async function checkJobQueueReadiness(options = {}) {
  loadEnvFile(options.envPath || ".env");
  const checks = [];
  checks.push(await checkPostgres(options));
  checks.push(await checkRedis(options));
  return {
    ok: checks.every((item) => item.ok),
    checks
  };
}

async function checkPostgres(options) {
  if (!(options.isPostgresConfigured || isPostgresConfigured)()) {
    return { name: "postgres", ok: false, message: "Postgres is not configured" };
  }
  try {
    const query = options.queryPostgres || queryPostgres;
    await query("select 1 as ok");
    await ensureJobQueueSchema(query);
    return { name: "postgres", ok: true, message: "connected; queue schema is present" };
  } catch (error) {
    return { name: "postgres", ok: false, message: error.message || String(error) };
  }
}

async function checkRedis(options) {
  const env = options.env || process.env;
  if (!shouldUseBullMq(env)) return { name: "redis", ok: true, message: "inline mode; Redis is not required" };
  try {
    const { Queue } = await loadBullMq(options);
    const queue = new Queue(getJobQueueName(env), { connection: getRedisConnection(env) });
    await queue.waitUntilReady();
    const counts = await queue.getJobCounts("waiting", "active", "delayed", "failed", "completed");
    await queue.close();
    return { name: "redis", ok: true, message: "connected", counts };
  } catch (error) {
    return { name: "redis", ok: false, message: error.message || String(error) };
  }
}

async function loadBullMq(options) {
  if (options.BullMQ) return options.BullMQ;
  try {
    return await import("bullmq");
  } catch (error) {
    throw new Error(`BullMQ is not installed or not available: ${error.message}`);
  }
}

function loadEnvFile(path) {
  try {
    const text = readFileSync(path, "utf8");
    text.split(/\r?\n/).forEach((line) => {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
    });
  } catch {
    // Env file is optional in production.
  }
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  checkJobQueueReadiness()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      if (!result.ok) process.exit(1);
    })
    .catch((error) => {
      console.error(error.message || error);
      process.exit(1);
    });
}
