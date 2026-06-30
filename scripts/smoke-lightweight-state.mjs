const defaultMaxBytes = 2 * 1024 * 1024;

async function main() {
  const baseUrl = stripTrailingSlash(process.env.SMOKE_BASE_URL || "http://127.0.0.1:4173");
  const maxBytes = Number(process.env.SMOKE_STATE_MAX_BYTES || defaultMaxBytes);
  const response = await fetch(`${baseUrl}/api/state`);
  const text = await response.text();
  const bytes = Buffer.byteLength(text, "utf8");
  const payload = parseJson(text);
  const forbidden = findForbiddenEmbeddedAssets(payload);
  const ok = response.ok && bytes <= maxBytes && forbidden.length === 0;
  const summary = {
    ok,
    status: response.status,
    bytes,
    maxBytes,
    transport: payload?.transport || null,
    updatedAt: payload?.updatedAt || "",
    forbiddenCount: forbidden.length,
    forbidden: forbidden.slice(0, 20)
  };
  console.log(JSON.stringify(summary, null, 2));
  if (!ok) process.exit(1);
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function findForbiddenEmbeddedAssets(value, path = "$", found = []) {
  if (!value || found.length > 100) return found;
  if (typeof value === "string") {
    if (/^data:(?:image|audio|video)\//i.test(value)) found.push(path);
    return found;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => findForbiddenEmbeddedAssets(item, `${path}[${index}]`, found));
    return found;
  }
  if (typeof value === "object") {
    Object.entries(value).forEach(([key, item]) => findForbiddenEmbeddedAssets(item, `${path}.${key}`, found));
  }
  return found;
}

function stripTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message || String(error) }, null, 2));
  process.exit(1);
});
