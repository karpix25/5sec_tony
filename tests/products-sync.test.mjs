import test from "node:test";
import assert from "node:assert/strict";
import { createRemoteProduct, updateRemoteProduct } from "../src/services/products-sync.js";

test("createRemoteProduct sends a small product payload to product endpoint", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    return jsonResponse({ saved: true, product: JSON.parse(options.body).product, updatedAt: "2026-06-29T10:00:00.000Z" });
  };

  try {
    const result = await createRemoteProduct({ id: "product-1", name: "Продукт" });

    assert.equal(calls[0].url, "/api/products");
    assert.equal(calls[0].options.method, "POST");
    assert.equal(calls[0].options.keepalive, true);
    assert.deepEqual(JSON.parse(calls[0].options.body), { product: { id: "product-1", name: "Продукт" } });
    assert.equal(result.saved, true);
    assert.equal(result.updatedAt, "2026-06-29T10:00:00.000Z");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("updateRemoteProduct addresses a single product", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    return jsonResponse({ saved: true, product: JSON.parse(options.body).product, updatedAt: "db-next" });
  };

  try {
    const result = await updateRemoteProduct("product 1", { id: "product 1", name: "Обновлен" });

    assert.equal(calls[0].url, "/api/products/product%201");
    assert.equal(calls[0].options.method, "PATCH");
    assert.equal(result.product.name, "Обновлен");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("product sync reports server errors with normalized message", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => jsonResponse({ error: "db unavailable" }, 500);

  try {
    await assert.rejects(
      () => updateRemoteProduct("product-1", { id: "product-1" }),
      /db unavailable/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  };
}
