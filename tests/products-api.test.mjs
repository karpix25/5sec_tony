import test from "node:test";
import assert from "node:assert/strict";
import { createProductsApiHandler } from "../scripts/products-api.mjs";

test("products api creates a product inside app-state transaction", async () => {
  const calls = [];
  const response = createJsonResponse();
  const handle = createProductsApiHandler({
    isPostgresConfigured: () => true,
    withPostgresTransaction: async (callback) => callback({
      query: async (text, params = []) => {
        calls.push(["query", text, params]);
        return { rows: [] };
      }
    }),
    saveProductForState: async (_query, key, product, options) => {
      calls.push(["save", key, product, options]);
      return { product: { ...product, name: "Saved" }, updatedAt: "2026-06-29T11:00:00.000Z" };
    }
  });

  const handled = await handle(
    createJsonRequest("POST", { product: { id: "product-1", projectId: "project-1", name: "Draft" } }),
    response,
    new URL("http://localhost/api/products")
  );

  assert.equal(handled, true);
  assert.equal(response.status, 200);
  assert.equal(response.payload.saved, true);
  assert.equal(response.payload.product.name, "Saved");
  assert.match(calls[0][1], /pg_advisory_xact_lock/);
  assert.deepEqual(calls.find((call) => call[0] === "save"), [
    "save",
    "default",
    { id: "product-1", projectId: "project-1", name: "Draft" },
    { mode: "create", selectProduct: true }
  ]);
});

test("products api reads a committed product for timeout reconciliation", async () => {
  const response = createJsonResponse();
  const handle = createProductsApiHandler({
    isPostgresConfigured: () => true,
    queryPostgres: async () => ({ rows: [] }),
    loadProductForState: async (_query, key, productId) => ({
      product: { id: productId, projectId: "project-1", name: "Сохраненный" },
      updatedAt: "db-v2"
    })
  });

  await handle(
    createJsonRequest("GET", {}),
    response,
    new URL("http://localhost/api/products/product-1")
  );

  assert.equal(response.status, 200);
  assert.equal(response.payload.product.name, "Сохраненный");
  assert.equal(response.payload.updatedAt, "db-v2");
});

test("products api patches the product from path without selecting it globally", async () => {
  const calls = [];
  const response = createJsonResponse();
  const handle = createProductsApiHandler({
    isPostgresConfigured: () => true,
    withPostgresTransaction: async (callback) => callback({ query: async () => ({ rows: [] }) }),
    saveProductForState: async (_query, _key, product, options) => {
      calls.push({ product, options });
      return { product, updatedAt: "db-next" };
    }
  });

  await handle(
    createJsonRequest("PATCH", { product: { name: "Updated" } }),
    response,
    new URL("http://localhost/api/products/product-1")
  );

  assert.equal(response.status, 200);
  assert.deepEqual(calls[0], {
    product: { name: "Updated", id: "product-1" },
    options: { mode: "update", selectProduct: false }
  });
});

test("products api rejects stale product writes before saving", async () => {
  let saveCalled = false;
  const response = createJsonResponse();
  const currentState = { projects: [{ id: "project-1" }], products: [{ id: "product-1", name: "Fresh" }] };
  const handle = createProductsApiHandler({
    isPostgresConfigured: () => true,
    withPostgresTransaction: async (callback) => callback({
      query: async (text) => {
        if (/updated_at/.test(text)) return { rows: [{ updated_at: "db-v2" }] };
        return { rows: [] };
      }
    }),
    loadNormalizedState: async () => currentState,
    loadLegacyState: async () => null,
    saveProductForState: async () => {
      saveCalled = true;
      return {};
    }
  });

  await handle(
    createJsonRequest("PATCH", { product: { name: "Stale" }, baseUpdatedAt: "db-v1" }),
    response,
    new URL("http://localhost/api/products/product-1")
  );

  assert.equal(response.status, 409);
  assert.equal(response.payload.conflict, true);
  assert.equal(response.payload.updatedAt, "db-v2");
  assert.deepEqual(response.payload.state, currentState);
  assert.equal(saveCalled, false);
});

test("products api accepts product writes on the current base version", async () => {
  const calls = [];
  const response = createJsonResponse();
  const handle = createProductsApiHandler({
    isPostgresConfigured: () => true,
    withPostgresTransaction: async (callback) => callback({
      query: async (text) => {
        if (/updated_at/.test(text)) return { rows: [{ updated_at: "db-v1" }] };
        return { rows: [] };
      }
    }),
    saveProductForState: async (_query, _key, product) => {
      calls.push(product);
      return { product, updatedAt: "db-v2" };
    }
  });

  await handle(
    createJsonRequest("PATCH", { product: { name: "Fresh save" }, baseUpdatedAt: "db-v1" }),
    response,
    new URL("http://localhost/api/products/product-1")
  );

  assert.equal(response.status, 200);
  assert.equal(response.payload.saved, true);
  assert.deepEqual(calls[0], { name: "Fresh save", id: "product-1" });
});

test("products api deletes the product from path inside app-state transaction", async () => {
  const calls = [];
  const response = createJsonResponse();
  const handle = createProductsApiHandler({
    isPostgresConfigured: () => true,
    withPostgresTransaction: async (callback) => callback({
      query: async (text) => {
        if (/updated_at/.test(text)) return { rows: [{ updated_at: "db-v1" }] };
        return { rows: [] };
      }
    }),
    deleteProductForState: async (_query, key, productId) => {
      calls.push(["delete", key, productId]);
      return { deletedProductId: productId, updatedAt: "db-v2" };
    }
  });

  await handle(
    createJsonRequest("DELETE", { baseUpdatedAt: "db-v1" }),
    response,
    new URL("http://localhost/api/products/product-1")
  );

  assert.equal(response.status, 200);
  assert.equal(response.payload.saved, true);
  assert.equal(response.payload.deletedProductId, "product-1");
  assert.deepEqual(calls, [["delete", "default", "product-1"]]);
});

test("products api rejects stale product deletes before deleting", async () => {
  let deleteCalled = false;
  const response = createJsonResponse();
  const currentState = { projects: [{ id: "project-1" }], products: [{ id: "product-1", name: "Fresh" }] };
  const handle = createProductsApiHandler({
    isPostgresConfigured: () => true,
    withPostgresTransaction: async (callback) => callback({
      query: async (text) => {
        if (/updated_at/.test(text)) return { rows: [{ updated_at: "db-v2" }] };
        return { rows: [] };
      }
    }),
    loadNormalizedState: async () => currentState,
    loadLegacyState: async () => null,
    deleteProductForState: async () => {
      deleteCalled = true;
      return {};
    }
  });

  await handle(
    createJsonRequest("DELETE", { baseUpdatedAt: "db-v1" }),
    response,
    new URL("http://localhost/api/products/product-1")
  );

  assert.equal(response.status, 409);
  assert.equal(response.payload.conflict, true);
  assert.equal(deleteCalled, false);
});

test("products api deletes one product through app-state transaction", async () => {
  const calls = [];
  const response = createJsonResponse();
  const handle = createProductsApiHandler({
    isPostgresConfigured: () => true,
    withPostgresTransaction: async (callback) => callback({
      query: async (text) => {
        if (/updated_at/.test(text)) return { rows: [{ updated_at: "db-v1" }] };
        return { rows: [] };
      }
    }),
    deleteProductForState: async (_query, key, productId) => {
      calls.push(["delete", key, productId]);
      return { deletedProductId: productId, updatedAt: "db-v2" };
    }
  });

  await handle(
    createJsonRequest("DELETE", { baseUpdatedAt: "db-v1" }),
    response,
    new URL("http://localhost/api/products/product-1")
  );

  assert.equal(response.status, 200);
  assert.equal(response.payload.saved, true);
  assert.equal(response.payload.deletedProductId, "product-1");
  assert.deepEqual(calls.find((call) => call[0] === "delete"), ["delete", "default", "product-1"]);
});

test("products api recreates a locally known product when relational row is missing", async () => {
  const calls = [];
  const response = createJsonResponse();
  const handle = createProductsApiHandler({
    isPostgresConfigured: () => true,
    withPostgresTransaction: async (callback) => callback({
      query: async (text) => {
        if (/updated_at/.test(text)) return { rows: [{ updated_at: "db-v1" }] };
        return { rows: [] };
      }
    }),
    saveProductForState: async (_query, _key, product, options) => {
      calls.push({ product, options });
      return { product: { ...product, name: "Recovered" }, updatedAt: "db-v2" };
    }
  });

  await handle(
    createJsonRequest("PATCH", { product: { id: "product-lost", projectId: "project-1", name: "Local draft" }, baseUpdatedAt: "db-v1" }),
    response,
    new URL("http://localhost/api/products/product-lost")
  );

  assert.equal(response.status, 200);
  assert.equal(response.payload.saved, true);
  assert.equal(response.payload.product.name, "Recovered");
  assert.deepEqual(calls[0], {
    product: { id: "product-lost", projectId: "project-1", name: "Local draft" },
    options: { mode: "update", selectProduct: false }
  });
});


test("products api rejects product id mismatches", async () => {
  const response = createJsonResponse();
  const handle = createProductsApiHandler({
    isPostgresConfigured: () => true,
    withPostgresTransaction: async () => {
      throw new Error("transaction should not run");
    }
  });

  await handle(
    createJsonRequest("PATCH", { product: { id: "product-2", name: "Wrong" } }),
    response,
    new URL("http://localhost/api/products/product-1")
  );

  assert.equal(response.status, 400);
  assert.match(response.payload.error, /does not match/);
});

test("products api keeps local fallback when postgres is disabled", async () => {
  const response = createJsonResponse();
  const handle = createProductsApiHandler({
    isPostgresConfigured: () => false
  });

  await handle(
    createJsonRequest("POST", { product: { id: "product-1" } }),
    response,
    new URL("http://localhost/api/products")
  );

  assert.equal(response.status, 200);
  assert.deepEqual(response.payload, { saved: false, disabled: true, reason: "postgres_not_configured" });
});

function createJsonResponse() {
  return {
    status: 0,
    payload: null,
    writeHead(status) {
      this.status = status;
    },
    end(payload) {
      this.payload = JSON.parse(payload);
    }
  };
}

function createJsonRequest(method, body) {
  const chunks = [JSON.stringify(body)];
  return {
    method,
    on(event, callback) {
      if (event === "data") chunks.forEach((chunk) => callback(Buffer.from(chunk)));
      if (event === "end") callback();
    },
    destroy() {}
  };
}
