import test from "node:test";
import assert from "node:assert/strict";
import { createInitialState } from "../src/state/initial-state.js";
import { createStore } from "../src/state/store.js";

test("remote product update skips full state save and refreshes next baseUpdatedAt", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const remoteState = createInitialState();
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url === "/api/state" && (!options.method || options.method === "GET")) {
      return jsonResponse({ state: remoteState, updatedAt: "t0" });
    }
    if (String(url).startsWith("/api/products/")) {
      return jsonResponse({ saved: true, product: JSON.parse(options.body).product, updatedAt: "t1" });
    }
    if (url === "/api/state" && options.method === "POST") {
      return jsonResponse({ saved: true, updatedAt: "t2" });
    }
    return jsonResponse({ error: `unexpected ${url}` }, 500);
  };

  try {
    const store = createStore();
    await store.whenHydrated();
    calls.length = 0;

    await store.updateProductRemote({ name: "Быстро сохраненный продукт" });
    await wait(320);

    assert.equal(store.getState().products.find((product) => product.id === store.getState().selectedProductId).name, "Быстро сохраненный продукт");
    assert.equal(calls.filter((call) => call.url === "/api/state" && call.options.method === "POST").length, 0);
    assert.equal(calls.some((call) => String(call.url).startsWith("/api/products/")), true);

    store.updateProjectSettings({ name: "Проект после продукта" });
    await wait(320);
    const stateSave = calls.find((call) => call.url === "/api/state" && call.options.method === "POST");

    assert.ok(stateSave, "next project save should still use full-state endpoint");
    assert.equal(JSON.parse(stateSave.options.body).baseUpdatedAt, "t1");
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

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
