import { StateSyncConflictError } from "./state-sync.js";
import { fetchJsonWithRetry } from "./sync-fetch.js";

export async function createRemoteProduct(product, baseUpdatedAt = "") {
  return saveRemoteProduct("/api/products", "POST", product, baseUpdatedAt);
}

export async function updateRemoteProduct(productId, product, baseUpdatedAt = "") {
  return saveRemoteProduct(`/api/products/${encodeURIComponent(productId)}`, "PATCH", product, baseUpdatedAt);
}

export async function deleteRemoteProduct(productId, baseUpdatedAt = "") {
  const body = JSON.stringify({ baseUpdatedAt });
  const { response, payload } = await fetchJsonWithRetry(`/api/products/${encodeURIComponent(productId)}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true
  });
  readProductSyncPayload(response, payload);
  return {
    saved: Boolean(payload.saved),
    disabled: Boolean(payload.disabled),
    deletedProductId: payload.deletedProductId || "",
    updatedAt: payload.updatedAt || "",
    error: payload.error || ""
  };
}

async function saveRemoteProduct(url, method, product, baseUpdatedAt) {
  const body = JSON.stringify({ product, baseUpdatedAt });
  const { response, payload } = await fetchJsonWithRetry(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: body.length < 60 * 1024
  });
  readProductSyncPayload(response, payload);
  return {
    saved: Boolean(payload.saved),
    disabled: Boolean(payload.disabled),
    product: payload.product || null,
    updatedAt: payload.updatedAt || "",
    error: payload.error || ""
  };
}

function readProductSyncPayload(response, payload = {}) {
  if (response.status === 409 || payload.conflict) {
    throw new StateSyncConflictError(payload);
  }
  if (!response.ok) throw new Error(payload.error || "Product sync request failed");
}
