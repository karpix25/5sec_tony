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
    if (String(url).startsWith("/api/projects/")) {
      return jsonResponse({ saved: true, project: JSON.parse(options.body).project, updatedAt: "t2" });
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

    await store.updateProjectSettingsRemote({ name: "Проект после продукта" });
    await wait(320);
    const projectSave = calls.find((call) => String(call.url).startsWith("/api/projects/"));

    assert.ok(projectSave, "next project save should use the project patch endpoint");
    assert.equal(JSON.parse(projectSave.options.body).baseUpdatedAt, "t1");
    assert.equal(calls.filter((call) => call.url === "/api/state" && call.options.method === "POST").length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("remote product update joins an already pending full-state save", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const remoteState = createInitialState();
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url === "/api/state" && (!options.method || options.method === "GET")) {
      return jsonResponse({ state: remoteState, updatedAt: "t0" });
    }
    if (String(url).startsWith("/api/products/")) return jsonResponse({ error: "product endpoint should not be used while state save is pending" }, 500);
    if (String(url).startsWith("/api/projects/")) return jsonResponse({ error: "project endpoint should not be used while state save is pending" }, 500);
    if (url === "/api/state" && options.method === "POST") {
      return jsonResponse({ saved: true, updatedAt: "t2" });
    }
    return jsonResponse({ error: `unexpected ${url}` }, 500);
  };

  try {
    const store = createStore();
    await store.whenHydrated();
    calls.length = 0;

    store.updateProjectSettings({ name: "Несохраненный проект" });
    await store.updateProductRemote({ name: "Быстрый продукт" });
    await wait(360);

    const productCalls = calls.filter((call) => String(call.url).startsWith("/api/products/"));
    const stateSaves = calls.filter((call) => call.url === "/api/state" && call.options.method === "POST");
    assert.equal(productCalls.length, 0);
    assert.equal(stateSaves.length, 1);
    const savedBody = JSON.parse(stateSaves[0].options.body);
    assert.equal(savedBody.baseUpdatedAt, "t0");
    assert.equal(savedBody.state.projects.find((project) => project.id === remoteState.selectedProjectId).name, "Несохраненный проект");
    assert.equal(savedBody.state.products.find((product) => product.id === remoteState.selectedProductId).name, "Быстрый продукт");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("remote product delete skips full state save and refreshes next baseUpdatedAt", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const remoteState = createInitialState();
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url === "/api/state" && (!options.method || options.method === "GET")) {
      return jsonResponse({ state: remoteState, updatedAt: "t0" });
    }
    if (String(url).startsWith("/api/products/") && options.method === "DELETE") {
      return jsonResponse({ saved: true, deletedProductId: decodeURIComponent(String(url).split("/").pop()), updatedAt: "t1" });
    }
    if (String(url).startsWith("/api/projects/")) {
      return jsonResponse({ saved: true, project: JSON.parse(options.body).project, updatedAt: "t2" });
    }
    if (url === "/api/state" && options.method === "POST") {
      return jsonResponse({ error: "full state save should not be used for product delete" }, 500);
    }
    return jsonResponse({ error: `unexpected ${url}` }, 500);
  };

  try {
    const store = createStore();
    await store.whenHydrated();
    const deletedId = store.getState().selectedProductId;
    calls.length = 0;

    await store.deleteProductRemote(deletedId);
    await wait(320);

    assert.equal(store.getState().products.some((product) => product.id === deletedId), false);
    assert.equal(store.getState().deletedProductIds.includes(deletedId), true);
    assert.equal(calls.some((call) => call.url === `/api/products/${encodeURIComponent(deletedId)}` && call.options.method === "DELETE"), true);
    assert.equal(calls.filter((call) => call.url === "/api/state" && call.options.method === "POST").length, 0);

    await store.updateProjectSettingsRemote({ name: "Проект после удаления" });
    await wait(320);
    const projectSave = calls.find((call) => String(call.url).startsWith("/api/projects/"));
    assert.equal(JSON.parse(projectSave.options.body).baseUpdatedAt, "t1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("stale remote product update retries on fresh db version", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  let productPatchAttempts = 0;
  const remoteState = createInitialState();
  const freshState = {
    ...remoteState,
    products: remoteState.products.map((product) =>
      product.id === remoteState.selectedProductId ? { ...product, name: "Свежий продукт из БД" } : product
    )
  };
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url === "/api/state" && (!options.method || options.method === "GET")) {
      return jsonResponse({ state: remoteState, updatedAt: "t0" });
    }
    if (String(url).startsWith("/api/products/")) {
      productPatchAttempts += 1;
      if (productPatchAttempts === 1) {
        return jsonResponse({
          conflict: true,
          error: "БД обновлена другим оператором",
          updatedAt: "t1",
          state: freshState
        }, 409);
      }
      return jsonResponse({
        saved: true,
        product: JSON.parse(options.body).product,
        updatedAt: "t2"
      });
    }
    return jsonResponse({ error: `unexpected ${url}` }, 500);
  };

  try {
    const store = createStore();
    await store.whenHydrated();
    calls.length = 0;

    await store.updateProductRemote({ name: "Устаревшая правка" });
    await wait(20);

    const product = store.getState().products.find((item) => item.id === remoteState.selectedProductId);
    const retryCall = calls.find((call) =>
      String(call.url).startsWith("/api/products/")
        && JSON.parse(call.options.body).baseUpdatedAt === "t1"
    );
    assert.equal(product.name, "Устаревшая правка");
    assert.equal(calls.filter((call) => String(call.url).startsWith("/api/products/")).length, 2);
    assert.equal(JSON.parse(retryCall.options.body).product.name, "Устаревшая правка");
    assert.equal(calls.filter((call) => call.url === "/api/state" && call.options.method === "POST").length, 0);
    assert.deepEqual(store.getOperations(), {});
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("remote product delete uses product endpoint and skips full state save", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const remoteState = {
    ...createInitialState(),
    products: [
      { id: "product-1", projectId: "supplements", name: "Первый" },
      { id: "product-2", projectId: "supplements", name: "Второй" }
    ],
    selectedProjectId: "supplements",
    selectedProductId: "product-1"
  };
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url === "/api/state" && (!options.method || options.method === "GET")) {
      return jsonResponse({ state: remoteState, updatedAt: "t0" });
    }
    if (url === "/api/products/product-1" && options.method === "DELETE") {
      return jsonResponse({ saved: true, deletedProductId: "product-1", updatedAt: "t1" });
    }
    if (url === "/api/state" && options.method === "POST") {
      return jsonResponse({ error: "full state save should not be used for product delete" }, 500);
    }
    return jsonResponse({ error: `unexpected ${url}` }, 500);
  };

  try {
    const store = createStore();
    await store.whenHydrated();
    calls.length = 0;

    await store.deleteProductRemote("product-1");
    await wait(320);

    assert.equal(store.getState().products.some((product) => product.id === "product-1"), false);
    assert.equal(store.getState().selectedProductId, "product-2");
    assert.equal(calls.filter((call) => call.url === "/api/state" && call.options.method === "POST").length, 0);
    assert.equal(JSON.parse(calls.find((call) => call.url === "/api/products/product-1").options.body).baseUpdatedAt, "t0");
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
