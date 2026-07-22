import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { spawn } from "node:child_process";
import { queryPostgres } from "./postgres-client.mjs";

const defaultTables = [
  "app_state",
  "studio_app_ui_state",
  "studio_projects",
  "studio_products",
  "studio_jobs",
  "studio_global_audio_assets",
  "studio_audio_library_refresh_reminders",
  "studio_hook_library_state",
  "studio_hook_versions",
  "studio_hook_items",
  "studio_reels_research",
  "studio_job_queues",
  "studio_job_queue_events"
];

const skippedAssetKeys = new Set(["fileData", "imageData", "audioData", "data", "payload"]);

export async function runPostgresBackup(options = {}) {
  loadEnvFile(options.envPath || ".env");
  const databaseUrl = options.databaseUrl || process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for Postgres backup");

  const appStateKey = options.appStateKey || process.env.APP_STATE_KEY || "default";
  const backupDir = createBackupDir(options.outDir || "backups/postgres", options.timestamp || createBackupTimestamp());
  const dumpPath = join(backupDir, "postgres.dump");
  const countsPath = join(backupDir, "table-counts.json");
  const linksPath = join(backupDir, "asset-links.json");
  const manifestPath = join(backupDir, "manifest.json");

  if (options.skipDump !== true) {
    await runPgDump({ databaseUrl, dumpPath, pgDumpBin: options.pgDumpBin || "pg_dump" });
  }

  const counts = await collectTableCounts(defaultTables);
  const state = await loadLegacyAppState(appStateKey);
  const assetLinks = collectAssetLinks(state);
  const manifest = {
    createdAt: new Date().toISOString(),
    appStateKey,
    database: describeDatabase(databaseUrl),
    dumpFile: basename(dumpPath),
    tableCountsFile: basename(countsPath),
    assetLinksFile: basename(linksPath),
    note: "Postgres backup only. Yandex/S3/local files are not duplicated; asset-links.json stores existing links/paths from state."
  };

  writeJson(countsPath, counts);
  writeJson(linksPath, assetLinks);
  writeJson(manifestPath, manifest);
  return { backupDir, dumpPath, countsPath, linksPath, manifestPath, counts, assetLinks };
}

export function buildPgDumpInvocation(databaseUrl, dumpPath) {
  const url = new URL(databaseUrl);
  const sslMode = url.searchParams.get("sslmode") || "";
  const env = {
    PGPASSWORD: decodeURIComponent(url.password || ""),
    PGSSLMODE: sslMode || undefined
  };
  const args = [
    "--format=custom",
    "--no-owner",
    "--no-privileges",
    "--file", dumpPath,
    "--host", url.hostname,
    "--port", url.port || "5432",
    "--username", decodeURIComponent(url.username || ""),
    "--dbname", url.pathname.replace(/^\//, "")
  ];
  return { args, env: Object.fromEntries(Object.entries(env).filter(([, value]) => value)) };
}

export function collectAssetLinks(value) {
  const links = new Set();
  collectLinks(value, links);
  return [...links].sort();
}

async function runPgDump({ databaseUrl, dumpPath, pgDumpBin }) {
  const { args, env } = buildPgDumpInvocation(databaseUrl, dumpPath);
  await new Promise((resolve, reject) => {
    const child = spawn(pgDumpBin, args, {
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`pg_dump failed with exit code ${code}: ${stderr.trim()}`));
    });
  });
}

async function collectTableCounts(tables) {
  const counts = {};
  for (const table of tables) {
    const exists = await tableExists(table);
    counts[table] = exists ? await countTableRows(table) : null;
  }
  return counts;
}

async function tableExists(table) {
  const result = await queryPostgres("select to_regclass($1) as table_name", [`public.${table}`]);
  return Boolean(result.rows[0]?.table_name);
}

async function countTableRows(table) {
  if (!/^[a-z_]+$/.test(table)) throw new Error(`Unsafe table name: ${table}`);
  const result = await queryPostgres(`select count(*)::int as count from ${table}`);
  return result.rows[0]?.count ?? 0;
}

async function loadLegacyAppState(appStateKey) {
  const exists = await tableExists("app_state");
  if (!exists) return {};
  const result = await queryPostgres("select data from app_state where id = $1 limit 1", [appStateKey]);
  const data = result.rows[0]?.data;
  return data && typeof data === "object" ? data : {};
}

function collectLinks(value, links, key = "") {
  if (skippedAssetKeys.has(key)) return;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (isAssetLink(trimmed)) links.add(trimmed);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectLinks(item, links, key));
    return;
  }
  if (value && typeof value === "object") {
    Object.entries(value).forEach(([childKey, childValue]) => collectLinks(childValue, links, childKey));
  }
}

function isAssetLink(value) {
  return /^(https?:\/\/|s3:\/\/|disk:\/)/i.test(value) && !/^data:/i.test(value);
}

function createBackupDir(root, timestamp) {
  const backupDir = join(root, timestamp);
  mkdirSync(backupDir, { recursive: true });
  return backupDir;
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function describeDatabase(databaseUrl) {
  const url = new URL(databaseUrl);
  return {
    host: url.hostname,
    port: url.port || "5432",
    database: url.pathname.replace(/^\//, ""),
    user: decodeURIComponent(url.username || ""),
    sslmode: url.searchParams.get("sslmode") || ""
  };
}

function createBackupTimestamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function loadEnvFile(path) {
  try {
    const text = readFileSync(path, "utf8");
    text.split(/\r?\n/).forEach((line) => {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
    });
  } catch {
    // Env file is optional; deployment environments can provide DATABASE_URL directly.
  }
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  runPostgresBackup()
    .then((result) => {
      console.log(JSON.stringify({
        backupDir: result.backupDir,
        dumpPath: result.dumpPath,
        tableCountsPath: result.countsPath,
        assetLinksPath: result.linksPath,
        manifestPath: result.manifestPath
      }, null, 2));
    })
    .catch((error) => {
      console.error(error.message || error);
      process.exit(1);
    });
}
