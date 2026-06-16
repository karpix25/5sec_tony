import { isPostgresConfigured, queryPostgres } from "./postgres-client.mjs";

const appStateKey = process.env.APP_STATE_KEY || "default";

export async function handleStateApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/state") {
    return handleLoadState(response);
  }
  if (request.method === "POST" && url.pathname === "/api/state") {
    return handleSaveState(request, response);
  }
  return false;
}

async function handleLoadState(response) {
  if (!isPostgresConfigured()) {
    return sendJson(response, 200, { state: null, disabled: true, reason: "postgres_not_configured" });
  }
  try {
    await ensureStateTable();
    const result = await queryPostgres(
      "select data, updated_at from app_state where id = $1 limit 1",
      [appStateKey]
    );
    const row = result.rows[0];
    return sendJson(response, 200, {
      state: row?.data || null,
      updatedAt: row?.updated_at || null,
      key: appStateKey
    });
  } catch (error) {
    return sendJson(response, 500, { error: error.message || "Не удалось загрузить состояние из Postgres" });
  }
}

async function handleSaveState(request, response) {
  if (!isPostgresConfigured()) {
    return sendJson(response, 200, { saved: false, disabled: true, reason: "postgres_not_configured" });
  }
  try {
    const body = await readJsonBody(request);
    if (!body.state || typeof body.state !== "object") {
      return sendJson(response, 400, { error: "state object is required" });
    }
    await ensureStateTable();
    const result = await queryPostgres(
      `insert into app_state (id, data, updated_at)
       values ($1, $2::jsonb, now())
       on conflict (id)
       do update set data = excluded.data, updated_at = now()
       returning updated_at`,
      [appStateKey, JSON.stringify(body.state)]
    );
    return sendJson(response, 200, { saved: true, key: appStateKey, updatedAt: result.rows[0]?.updated_at || null });
  } catch (error) {
    return sendJson(response, 500, { error: error.message || "Не удалось сохранить состояние в Postgres" });
  }
}

async function ensureStateTable() {
  await queryPostgres(`
    create table if not exists app_state (
      id text primary key,
      data jsonb not null,
      updated_at timestamptz not null default now()
    )
  `);
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let data = "";
    request.on("data", (chunk) => {
      data += chunk;
      if (data.length > 20 * 1024 * 1024) {
        reject(new Error("Request body is too large"));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
  return true;
}
