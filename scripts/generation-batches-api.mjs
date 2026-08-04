import { createGenerationBatch, getGenerationBatchStatus } from "./generation-batch-runner.mjs";
import { assertBullMqConfig } from "./job-queue-dispatcher.mjs";

export async function handleGenerationBatchesApi(request, response, url) {
  if (request.method === "POST" && url.pathname === "/api/generation/batches") {
    return createBatch(request, response);
  }
  if (request.method === "GET" && url.pathname === "/api/generation/batches/status") {
    return getBatch(response, url.searchParams.get("batchId"));
  }
  return false;
}

async function createBatch(request, response) {
  try {
    const body = await readJson(request);
    ensureRequiredQueue(body);
    const payload = await createGenerationBatch({
      count: body.count,
      distributeProducts: body.distributeProducts === true,
      source: body.source,
      selection: body.selection || {},
      reservation: body.reservation || {},
      origin: getInternalServerOrigin()
    });
    const { batchId, jobs, queue, updatedAt } = payload;
    return sendJson(response, 202, { batchId, jobs, queue, updatedAt });
  } catch (error) {
    const batchError = normalizeBatchError(error);
    return sendJson(response, batchError.status, {
      error: batchError.message,
      code: batchError.code
    });
  }
}

function normalizeBatchError(error) {
  if (error.code === "JOB_QUEUE_NOT_CONFIGURED") {
    return {
      status: 503,
      code: error.code,
      message: error.message || "Серверная очередь не настроена. Генерация не запущена."
    };
  }
  if (isStateBackendConfigError(error)) {
    return {
      status: 503,
      code: "STATE_BACKEND_NOT_CONFIGURED",
      message: `Серверное состояние не настроено. Генерация не запущена: ${error.message}`
    };
  }
  return {
    status: error.statusCode || 502,
    code: error.code || "GENERATION_BATCH_ERROR",
    message: error.message || "Не удалось запустить очередь генерации"
  };
}

function isStateBackendConfigError(error) {
  return /Postgres is not configured/i.test(String(error?.message || ""));
}

function ensureRequiredQueue(body = {}) {
  if (body.requireQueue !== true && body.source !== "automation") return;
  try {
    assertBullMqConfig(process.env, { requireStrict: true });
  } catch (error) {
    if (error.code !== "JOB_QUEUE_NOT_CONFIGURED") throw error;
    const wrapped = new Error(`Серверная очередь не настроена. Авторежим не запущен: ${error.message}.`);
    wrapped.code = error.code;
    throw wrapped;
  }
}

async function getBatch(response, batchId) {
  if (!batchId) return sendJson(response, 400, { error: "batchId is required" });
  try {
    return sendJson(response, 200, await getGenerationBatchStatus(batchId));
  } catch (error) {
    return sendJson(response, 502, { error: error.message || "Не удалось прочитать очередь генерации" });
  }
}

function getInternalServerOrigin() {
  return process.env.INTERNAL_SERVER_ORIGIN || `http://127.0.0.1:${process.env.PORT || 4173}`;
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let data = "";
    request.on("data", (chunk) => { data += chunk; });
    request.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch (error) { reject(error); }
    });
  });
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
  return true;
}
