#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { basename } from "node:path";
import { queryPostgres } from "./postgres-client.mjs";
import { uploadYandexDiskFile, verifyYandexUploadedResource } from "./yandex-disk-api.mjs";

const appStateKey = process.env.APP_STATE_KEY || "default";
const yandexApiUrl = "https://cloud-api.yandex.net/v1/disk/resources";

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await auditYandexUploads({ ...options, reupload: options.apply });
  console.log(JSON.stringify(result, null, 2));
}

export async function auditYandexUploads(options = {}) {
  const token = options.token || process.env.YANDEX_DISK_TOKEN || process.env.YANDEX_OAUTH_TOKEN;
  if (!token) throw new Error("YANDEX_DISK_TOKEN is not configured");

  const query = options.query || queryPostgres;
  const jobs = await loadCandidateJobs({ ...options, query });
  const results = [];
  for (const job of jobs) {
    results.push(await inspectOrRepairJob(job, token, { ...options, query }));
  }

  const summary = summarizeResults(results);
  return {
    mode: options.apply ? "apply" : "dry-run",
    checked: results.length,
    ok: summary.ok || 0,
    missing: summary.missing || 0,
    reuploaded: summary.reuploaded || 0,
    skipped: summary.skipped || 0,
    summary,
    missingItems: results.filter((item) => item.status === "missing"),
    results
  };
}

async function inspectOrRepairJob(job, token, options) {
  const diskPath = String(job.disk_path || "");
  if (!diskPath) return buildResult(job, "skipped", "missing_disk_path");

  const existing = options.fetch
    ? await verifyExistingWithFetch(options.fetch, token, diskPath)
    : await verifyExisting(token, diskPath);
  if (existing.ok) {
    if (options.apply) await markJobVerified(job, existing.resource, options.query);
    return buildResult(job, "ok", "file_exists", existing.resource);
  }

  if (!options.apply) return buildResult(job, "missing", existing.error);
  if (!options.reupload) {
    await markJobMissing(job, existing.error, options.query);
    return buildResult(job, "missing", existing.error);
  }
  const sourceUrl = await resolveRepairSourceUrl(job.final_video_url);
  if (!sourceUrl) return buildResult(job, "skipped", "missing_source_url");

  const upload = await uploadYandexDiskFile({
    token,
    targetFolder: getDiskFolder(diskPath),
    fileName: basename(diskPath),
    fileUrl: sourceUrl
  });
  await markJobUploaded(job, upload, options.query);
  return buildResult(job, "reuploaded", "file_reuploaded", upload);
}

async function loadCandidateJobs(options) {
  const query = options.query || queryPostgres;
  const filters = ["j.app_state_key = $1", "coalesce(j.extra->>'diskPath', '') <> ''"];
  const params = [appStateKey];
  if (options.project) {
    params.push(options.project.toLowerCase());
    filters.push("(lower(p.id) = $2 or lower(p.name) = $2)");
  }
  params.push(options.limit);
  const limitParam = params.length;
  const result = await query(
    `select j.id,
            j.project_id,
            p.name as project_name,
            j.final_video_url,
            j.extra,
            j.extra->>'diskPath' as disk_path
       from studio_jobs j
       left join studio_projects p on p.app_state_key = j.app_state_key and p.id = j.project_id
      where ${filters.join(" and ")}
      order by j.updated_at desc
      limit $${limitParam}`,
    params
  );
  return result.rows;
}

async function verifyExisting(token, diskPath) {
  try {
    const resource = await verifyYandexUploadedResource(token, diskPath, {
      retryOptions: { attempts: 1, baseDelayMs: 1, maxDelayMs: 1 }
    });
    return { ok: true, resource };
  } catch (error) {
    return { ok: false, error: error.message || "missing_on_disk" };
  }
}

async function verifyExistingWithFetch(fetchFn, token, diskPath) {
  const params = new URLSearchParams({
    path: diskPath,
    fields: "path,name,type,size,public_url"
  });
  const response = await fetchFn(`${yandexApiUrl}?${params}`, {
    headers: { Authorization: getYandexAuthHeader(token) }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.type !== "file") return { ok: false, error: payload.message || payload.error || "missing_on_disk" };
  return { ok: true, resource: normalizeVerifiedResource(payload, diskPath) };
}

async function markJobVerified(job, resource, query = queryPostgres) {
  const extra = {
    ...asObject(job.extra),
    diskStatus: "done",
    diskVerifiedAt: resource.verifiedAt,
    diskSize: resource.size || 0,
    diskMessage: "Файл найден и проверен в Яндекс.Диске"
  };
  await updateJobExtra(job.id, extra, query);
}

async function markJobMissing(job, message, query = queryPostgres) {
  const extra = {
    ...asObject(job.extra),
    diskStatus: "missing_on_disk",
    diskMessage: message || "missing_on_disk"
  };
  await updateJobExtra(job.id, extra, query);
}

async function markJobUploaded(job, upload, query = queryPostgres) {
  const extra = {
    ...asObject(job.extra),
    diskStatus: "done",
    diskPath: upload.diskPath,
    diskUrl: upload.publicUrl || "",
    diskVerifiedAt: upload.verifiedAt,
    diskSize: upload.size || 0,
    diskVerification: upload.verification || null,
    diskMessage: "Файл повторно сохранён и проверен в Яндекс.Диске"
  };
  await query(
    `update studio_jobs
        set final_video_url = $3, extra = $4::jsonb, updated_at = now()
      where app_state_key = $1 and id = $2`,
    [appStateKey, job.id, upload.publicUrl || job.final_video_url || "", JSON.stringify(extra)]
  );
}

async function updateJobExtra(jobId, extra, query = queryPostgres) {
  await query(
    `update studio_jobs set extra = $3::jsonb, updated_at = now() where app_state_key = $1 and id = $2`,
    [appStateKey, jobId, JSON.stringify(extra)]
  );
}

async function resolveRepairSourceUrl(value) {
  const source = String(value || "");
  if (!/^https?:\/\//i.test(source)) return source;
  if (!/yadi\.sk|disk\.yandex\./i.test(source)) return source;
  const url = `https://cloud-api.yandex.net/v1/disk/public/resources/download?public_key=${encodeURIComponent(source)}`;
  const response = await fetch(url);
  const payload = await response.json().catch(() => ({}));
  return response.ok && payload.href ? payload.href : source;
}

function buildResult(job, status, message, resource = {}) {
  return {
    id: job.id,
    project: job.project_name || job.project_id || "",
    status,
    message,
    diskPath: job.disk_path || "",
    publicUrl: resource.publicUrl || resource.public_url || "",
    size: resource.size || 0
  };
}

function normalizeVerifiedResource(resource, diskPath) {
  return {
    path: resource.path || diskPath,
    name: resource.name || basename(diskPath),
    type: resource.type || "file",
    size: Number(resource.size || 0),
    publicUrl: resource.public_url || "",
    verifiedAt: new Date().toISOString()
  };
}

function summarizeResults(results) {
  return results.reduce((summary, item) => {
    summary[item.status] = (summary[item.status] || 0) + 1;
    return summary;
  }, {});
}

function getDiskFolder(diskPath) {
  return String(diskPath || "").split("/").slice(0, -1).join("/") || "disk:/ВИДЕО";
}

function parseArgs(args) {
  const options = { apply: false, project: "", limit: 100 };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--apply") options.apply = true;
    else if (arg === "--dry-run") options.apply = false;
    else if (arg === "--project") options.project = String(args[++index] || "");
    else if (arg === "--limit") options.limit = Math.max(1, Number(args[++index] || 100));
  }
  return options;
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function getYandexAuthHeader(token) {
  const value = String(token || "").trim();
  return /^OAuth\s+/i.test(value) ? value : `OAuth ${value}`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}
