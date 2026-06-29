export async function createRemoteProduct(product) {
  return saveRemoteProduct("/api/products", "POST", product);
}

export async function updateRemoteProduct(productId, product) {
  return saveRemoteProduct(`/api/products/${encodeURIComponent(productId)}`, "PATCH", product);
}

async function saveRemoteProduct(url, method, product) {
  const body = JSON.stringify({ product });
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: body.length < 60 * 1024
  });
  const payload = await readProductSyncResponse(response);
  return {
    saved: Boolean(payload.saved),
    disabled: Boolean(payload.disabled),
    product: payload.product || null,
    updatedAt: payload.updatedAt || "",
    error: payload.error || ""
  };
}

async function readProductSyncResponse(response) {
  let payload = {};
  try {
    payload = await response.json();
  } catch {}
  if (!response.ok) throw new Error(payload.error || "Product sync request failed");
  return payload;
}
