import { isPostgresConfigured, withPostgresTransaction } from "./postgres-client.mjs";
import { defaultAppStateKey, lockAppState, withAppStateRetry } from "./app-state-lock.mjs";
import { ProductPersistenceError, saveProductForState } from "./product-state-store.mjs";

const appStateKey = defaultAppStateKey;

export const handleProductsApi = createProductsApiHandler();

export function createProductsApiHandler(deps = {}) {
  const isConfigured = deps.isPostgresConfigured || isPostgresConfigured;
  const withTransaction = deps.withPostgresTransaction || withPostgresTransaction;
  const saveProduct = deps.saveProductForState || saveProductForState;

  return async function handleProductsApi(request, response, url) {
    if (request.method === "POST" && url.pathname === "/api/products") {
      return handleSaveProduct(request, response, { isConfigured, withTransaction, saveProduct, mode: "create" });
    }
    const productId = getProductId(url.pathname);
    if (request.method === "PATCH" && productId) {
      return handleSaveProduct(request, response, { isConfigured, withTransaction, saveProduct, mode: "update", productId });
    }
    return false;
  };
}

async function handleSaveProduct(request, response, deps) {
  if (!deps.isConfigured()) {
    return sendJson(response, 200, { saved: false, disabled: true, reason: "postgres_not_configured" });
  }
  try {
    const body = await readJsonBody(request);
    const product = getProductPayload(body);
    if (!isPlainObject(product)) return sendJson(response, 400, { error: "product object is required" });
    if (deps.productId && product.id && product.id !== deps.productId) {
      return sendJson(response, 400, { error: "product id does not match request path" });
    }
    const result = await withAppStateRetry(() => deps.withTransaction(async (tx) => {
      await lockAppState(tx.query, appStateKey);
      return deps.saveProduct(tx.query, appStateKey, { ...product, id: deps.productId || product.id }, {
        mode: deps.mode,
        selectProduct: deps.mode === "create"
      });
    }));
    return sendJson(response, 200, {
      saved: true,
      key: appStateKey,
      product: result.product,
      updatedAt: result.updatedAt || ""
    });
  } catch (error) {
    const status = error instanceof ProductPersistenceError ? error.status : 500;
    return sendJson(response, status, { error: error.message || "Не удалось сохранить продукт" });
  }
}

function getProductId(pathname) {
  const match = pathname.match(/^\/api\/products\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : "";
}

function getProductPayload(body) {
  if (isPlainObject(body?.product)) return body.product;
  if (isPlainObject(body?.payload)) return body.payload;
  return body;
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let data = "";
    request.on("data", (chunk) => {
      data += chunk;
      if (data.length > 8 * 1024 * 1024) {
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
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
  return true;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
