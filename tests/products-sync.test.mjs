import test from "node:test";
import assert from "node:assert/strict";
import { StateSyncConflictError } from "../src/services/state-sync.js";
import { createRemoteProduct, deleteRemoteProduct, updateRemoteProduct } from "../src/services/products-sync.js";

test("createRemoteProduct sends a small product payload to product endpoint", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    return jsonResponse({ saved: true, product: JSON.parse(options.body).product, updatedAt: "2026-06-29T10:00:00.000Z" });
  };

  try {
    const result = await createRemoteProduct({ id: "product-1", name: "Продукт" }, "db-v1");

    assert.equal(calls[0].url, "/api/products");
    assert.equal(calls[0].options.method, "POST");
    assert.equal(calls[0].options.keepalive, true);
    assert.deepEqual(JSON.parse(calls[0].options.body), { product: { id: "product-1", name: "Продукт" }, baseUpdatedAt: "db-v1" });
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
    const result = await updateRemoteProduct("product 1", { id: "product 1", name: "Обновлен" }, "db-v1");

    assert.equal(calls[0].url, "/api/products/product%201");
    assert.equal(calls[0].options.method, "PATCH");
    assert.equal(JSON.parse(calls[0].options.body).baseUpdatedAt, "db-v1");
    assert.equal(result.product.name, "Обновлен");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("deleteRemoteProduct sends base version to a single product endpoint", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    return jsonResponse({ saved: true, deletedProductId: "product 1", updatedAt: "db-next" });
  };

  try {
    const result = await deleteRemoteProduct("product 1", "db-v1");

    assert.equal(calls[0].url, "/api/products/product%201");
    assert.equal(calls[0].options.method, "DELETE");
    assert.deepEqual(JSON.parse(calls[0].options.body), { baseUpdatedAt: "db-v1" });
    assert.equal(result.deletedProductId, "product 1");
    assert.equal(result.updatedAt, "db-next");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("product sync raises a state conflict for stale product writes", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => jsonResponse({
    conflict: true,
    error: "БД обновлена другим оператором",
    updatedAt: "db-v2",
    state: { products: [] }
  }, 409);

  try {
    await assert.rejects(
      () => updateRemoteProduct("product-1", { id: "product-1" }, "db-v1"),
      (error) => {
        assert.equal(error instanceof StateSyncConflictError, true);
        assert.equal(error.updatedAt, "db-v2");
        assert.deepEqual(error.state, { products: [] });
        return true;
      }
    );
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
