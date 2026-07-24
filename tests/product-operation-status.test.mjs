import test from "node:test";
import assert from "node:assert/strict";
import { createInitialState } from "../src/state/initial-state.js";
import { createStore } from "../src/state/store.js";

test("product reference remote mutations expose scoped status and serialize per product", async () => {
  const initialState = createInitialState();
  const productId = initialState.selectedProductId;
  let releaseFirstPatch;
  const calls = [];
  const { restore } = installFetch(async (url, options = {}) => {
    calls.push({ url, options });
    if (isStateGet(url, options)) return jsonResponse({ state: initialState, updatedAt: "t0" });
    if (url === `/api/products/${productId}` && options.method === "PATCH") {
      if (!releaseFirstPatch) {
        await new Promise((resolve) => {
          releaseFirstPatch = resolve;
        });
      }
      const product = JSON.parse(options.body).product;
      return jsonResponse({ saved: true, product, updatedAt: `t${calls.length}` });
    }
    if (isStatePost(url, options)) return jsonResponse({ error: "full state save should not run" }, 500);
    return jsonResponse({ error: `unexpected ${url}` }, 500);
  });

  try {
    const store = createStore();
    await store.whenHydrated();
    calls.length = 0;

    const first = store.createProductReferenceRemote({
      id: "product-ref-queued",
      title: "Референс продукта",
      imageData: "https://cdn.example.com/product.png"
    });
    await wait(0);
    const active = Object.values(store.getOperations()).find((operation) => operation.targetId === "product-ref-queued");
    assert.equal(active.scope, `product:${productId}`);
    assert.equal(active.status, "saving");

    const second = store.updateProductRemote({ name: "После фото" });
    await wait(10);
    assert.equal(calls.filter((call) => call.url === `/api/products/${productId}`).length, 1);
    releaseFirstPatch();
    await Promise.all([first, second]);

    assert.equal(calls.filter((call) => call.url === `/api/products/${productId}`).length, 2);
    assert.deepEqual(store.getOperations(), {});
  } finally {
    restore();
  }
});

function installFetch(handler) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (url, options = {}) => handler(String(url), options);
  return {
    restore: () => {
      globalThis.fetch = originalFetch;
    }
  };
}

function isStateGet(url, options = {}) {
  return url === "/api/state" && (!options.method || options.method === "GET");
}

function isStatePost(url, options = {}) {
  return url === "/api/state" && options.method === "POST";
}

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
