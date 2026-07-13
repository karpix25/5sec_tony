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
      selection: body.selection || {},
      origin: getInternalServerOrigin()
    });
    return sendJson(response, 202, payload);
  } catch (error) {
    const status = error.code === "JOB_QUEUE_NOT_CONFIGURED" ? 503 : 502;
    return sendJson(response, status, {
      error: error.message || "Не удалось запустить очередь генерации",
      code: error.code || "GENERATION_BATCH_ERROR"
    });
  }
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
  return `http://127.0.0.1:${process.env.PORT || 4173}`;
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
