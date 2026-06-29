import { readFileSync } from "node:fs";

const terminalStatuses = new Set(["done", "review", "failed"]);

export async function runJobQueueSmokeTest(options = {}) {
  const config = normalizeSmokeOptions(options);
  const payloads = loadPayloads(config.file).slice(0, config.count);
  if (!payloads.length) throw new Error("Smoke payload file has no jobs");
  const started = await runWithConcurrency(payloads, config.concurrency, (payload) => startJob(config.baseUrl, payload));
  const results = await runWithConcurrency(started, config.concurrency, (item) => waitForTerminal(config.baseUrl, item.jobId, config));
  return {
    ok: results.every((item) => terminalStatuses.has(item.status)),
    total: results.length,
    results
  };
}

export function normalizeSmokeOptions(options = {}) {
  return {
    baseUrl: stripTrailingSlash(options.baseUrl || process.env.SMOKE_BASE_URL || "http://127.0.0.1:4173"),
    file: options.file || process.env.SMOKE_JOBS_FILE || "",
    count: Number(options.count || process.env.SMOKE_JOB_COUNT || 20),
    concurrency: Number(options.concurrency || process.env.SMOKE_CONCURRENCY || 3),
    pollMs: Number(options.pollMs || process.env.SMOKE_POLL_MS || 5000),
    timeoutMs: Number(options.timeoutMs || process.env.SMOKE_TIMEOUT_MS || 20 * 60 * 1000)
  };
}

function loadPayloads(path) {
  if (!path) throw new Error("Set SMOKE_JOBS_FILE or pass --file with prepared job payloads");
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  const jobs = Array.isArray(parsed) ? parsed : parsed.jobs;
  if (!Array.isArray(jobs)) throw new Error("Smoke payload file must be an array or { jobs: [...] }");
  return jobs.map((item) => ({ job: item.job || item, context: item.context || {} }));
}

async function startJob(baseUrl, payload) {
  const response = await fetch(`${baseUrl}/api/jobs/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const body = await readResponseJson(response);
  if (!response.ok) throw new Error(`run failed ${response.status}: ${body.error || response.statusText}`);
  return { jobId: body.job?.id || payload.job?.id, accepted: body.job };
}

async function waitForTerminal(baseUrl, jobId, config) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < config.timeoutMs) {
    const response = await fetch(`${baseUrl}/api/jobs/status?jobId=${encodeURIComponent(jobId)}`);
    const body = await readResponseJson(response);
    if (!response.ok) throw new Error(`status failed ${response.status}: ${body.error || response.statusText}`);
    const status = body.job?.status || "";
    if (terminalStatuses.has(status)) return { jobId, status, queueStatus: body.job?.queueStatus || "" };
    await delay(config.pollMs);
  }
  return { jobId, status: "timeout", queueStatus: "" };
}

async function runWithConcurrency(items, concurrency, worker) {
  const results = [];
  let index = 0;
  const runners = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await worker(items[current]);
    }
  });
  await Promise.all(runners);
  return results;
}

async function readResponseJson(response) {
  return await response.json().catch(() => ({}));
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stripTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function parseCliArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--file") options.file = argv[index += 1];
    else if (item === "--base-url") options.baseUrl = argv[index += 1];
    else if (item === "--count") options.count = argv[index += 1];
    else if (item === "--concurrency") options.concurrency = argv[index += 1];
    else if (item === "--timeout-ms") options.timeoutMs = argv[index += 1];
  }
  return options;
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  runJobQueueSmokeTest(parseCliArgs(process.argv.slice(2)))
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      if (!result.ok) process.exit(1);
    })
    .catch((error) => {
      console.error(error.message || error);
      process.exit(1);
    });
}
