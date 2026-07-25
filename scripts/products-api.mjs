import { isPostgresConfigured, withPostgresTransaction } from "./postgres-client.mjs";
import { defaultAppStateKey } from "./app-state-lock.mjs";
import {
  buildConflictPayload,
  isPlainObject,
  readJsonBody,
  sendJson,
  writeWithConflictCheck
} from "./app-state-api-helpers.mjs";
import { ProductPersistenceError, deleteProductForState, saveProductForState } from "./product-state-store.mjs";
import { loadLegacyState, loadNormalizedState } from "./state-relational-store.mjs";

const appStateKey = defaultAppStateKey;
const productsJsonBodyLimitBytes = 8 * 1024 * 1024;

export const handleProductsApi = createProductsApiHandler();

export function createProductsApiHandler(deps = {}) {
  const isConfigured = deps.isPostgresConfigured || isPostgresConfigured;
  const withTransaction = deps.withPostgresTransaction || withPostgresTransaction;
  const saveProduct = deps.saveProductForState || saveProductForState;
  const deleteProduct = deps.deleteProductForState || deleteProductForState;
  const loadNormalized = deps.loadNormalizedState || loadNormalizedState;
  const loadLegacy = deps.loadLegacyState || loadLegacyState;

  return async function handleProductsApi(request, response, url) {
    if (request.method === "POST" && url.pathname === "/api/products") {
      return handleSaveProduct(request, response, { isConfigured, withTransaction, saveProduct, loadNormalized, loadLegacy, mode: "create" });
    }
    const productId = getProductId(url.pathname);
    if (request.method === "PATCH" && productId) {
      return handleSaveProduct(request, response, { isConfigured, withTransaction, saveProduct, loadNormalized, loadLegacy, mode: "update", productId });
    }
    if (request.method === "DELETE" && productId) {
      return handleDeleteProduct(request, response, { isConfigured, withTransaction, deleteProduct, loadNormalized, loadLegacy, productId });
    }
    return false;
  };
}

async function handleSaveProduct(request, response, deps) {
  if (!deps.isConfigured()) {
    return sendJson(response, 200, { saved: false, disabled: true, reason: "postgres_not_configured" });
  }
  try {
    const body = await readJsonBody(request, { limitBytes: productsJsonBodyLimitBytes });
    const product = getProductPayload(body);
    if (!isPlainObject(product)) return sendJson(response, 400, { error: "product object is required" });
    if (deps.productId && product.id && product.id !== deps.productId) {
      return sendJson(response, 400, { error: "product id does not match request path" });
    }
    const result = await writeWithConflictCheck(body, deps, (tx) =>
      deps.saveProduct(tx.query, appStateKey, { ...product, id: deps.productId || product.id }, {
        mode: deps.mode,
        selectProduct: deps.mode === "create"
      })
    );
    if (result.conflict) {
      return sendJson(response, 409, buildConflictPayload(result, {
        error: "БД обновлена другим оператором. Данные обновлены, повторите сохранение продукта.",
        key: appStateKey
      }));
    }
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

async function handleDeleteProduct(request, response, deps) {
  if (!deps.isConfigured()) {
    return sendJson(response, 200, { saved: false, disabled: true, reason: "postgres_not_configured" });
  }
  try {
    const body = await readJsonBody(request, { limitBytes: productsJsonBodyLimitBytes });
    const result = await writeWithConflictCheck(body, deps, (tx) =>
      deps.deleteProduct(tx.query, appStateKey, deps.productId)
    );
    if (result.conflict) {
      return sendJson(response, 409, buildConflictPayload(result, {
        error: "БД обновлена другим оператором. Данные обновлены, повторите удаление продукта.",
        key: appStateKey
      }));
    }
    return sendJson(response, 200, {
      saved: true,
      key: appStateKey,
      deletedProductId: result.deletedProductId || "",
      updatedAt: result.updatedAt || ""
    });
  } catch (error) {
    const status = error instanceof ProductPersistenceError ? error.status : 500;
    return sendJson(response, status, { error: error.message || "Не удалось удалить продукт" });
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
