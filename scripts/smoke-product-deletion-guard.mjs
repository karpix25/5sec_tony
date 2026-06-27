const baseUrl = process.env.SMOKE_BASE_URL || "http://127.0.0.1:4173";
const allowRejectedWriteProbe = process.env.SMOKE_ALLOW_REJECTED_WRITE === "true";

const loaded = await loadState();
const state = loaded.state;
const products = Array.isArray(state?.products) ? state.products : [];

if (!allowRejectedWriteProbe) {
  console.log(JSON.stringify({
    ok: true,
    mode: "read-only",
    productCount: products.length,
    projectCount: Array.isArray(state?.projects) ? state.projects.length : 0,
    updatedAt: loaded.updatedAt || "",
    note: "Set SMOKE_ALLOW_REJECTED_WRITE=true to verify the 409 deletion guard probe."
  }, null, 2));
  process.exit(0);
}

if (products.length < 2) {
  throw new Error(`Need at least 2 products for smoke test, got ${products.length}`);
}

const removed = products[products.length - 1];
const probeState = {
  ...state,
  products: products.slice(0, -1)
};

const response = await fetch(`${baseUrl}/api/state`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ state: probeState, baseUpdatedAt: loaded.updatedAt || "" })
});
const payload = await response.json().catch(() => ({}));
const after = await loadState();
const afterProducts = Array.isArray(after.state?.products) ? after.state.products : [];
const unchanged = afterProducts.length === products.length && afterProducts.some((product) => product.id === removed.id);

if (response.status !== 409 || !payload.conflict || !unchanged) {
  throw new Error(JSON.stringify({
    message: "Product deletion guard smoke failed",
    status: response.status,
    conflict: payload.conflict,
    removed: { id: removed.id, name: removed.name },
    beforeCount: products.length,
    afterCount: afterProducts.length,
    unchanged
  }, null, 2));
}

console.log(JSON.stringify({
  ok: true,
  status: response.status,
  conflict: payload.conflict,
  removedProbe: { id: removed.id, name: removed.name },
  beforeCount: products.length,
  afterCount: afterProducts.length,
  unchanged
}, null, 2));

async function loadState() {
  const response = await fetch(`${baseUrl}/api/state`);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `State load failed: ${response.status}`);
  if (!payload.state) throw new Error("State payload is empty");
  return payload;
}
