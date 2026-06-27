import test from "node:test";
import assert from "node:assert/strict";
import { createStateApiHandler } from "../scripts/state-api.mjs";
import { createStore } from "../src/state/store.js";

test("product deletion guard allows adding products without tombstones", async () => {
  const currentState = createState(["product-1", "product-2"]);
  const nextState = createState(["product-3", "product-1", "product-2"]);
  const saved = [];
  const response = await saveThroughStateApi({
    currentState,
    nextState,
    saved,
    baseUpdatedAt: "2026-06-27T10:00:00.000Z"
  });

  assert.equal(response.status, 200);
  assert.deepEqual(saved[0].products.map((product) => product.id), ["product-3", "product-1", "product-2"]);
});

test("product deletion guard allows editing products without tombstones", async () => {
  const currentState = createState(["product-1", "product-2"]);
  const nextState = {
    ...currentState,
    products: currentState.products.map((product) =>
      product.id === "product-2" ? { ...product, name: "Обновленный продукт" } : product
    )
  };
  const saved = [];
  const response = await saveThroughStateApi({
    currentState,
    nextState,
    saved,
    baseUpdatedAt: "2026-06-27T10:00:00.000Z"
  });

  assert.equal(response.status, 200);
  assert.equal(saved[0].products.find((product) => product.id === "product-2").name, "Обновленный продукт");
});

test("product deletion guard rejects missing product from fresh snapshot", async () => {
  const currentState = createState(["product-1", "product-2", "product-3"]);
  const nextState = createState(["product-1", "product-2"]);
  const saved = [];
  const response = await saveThroughStateApi({
    currentState,
    nextState,
    saved,
    baseUpdatedAt: "2026-06-27T10:00:00.000Z"
  });

  assert.equal(response.status, 409);
  assert.match(response.payload.error, /Product deletion requires explicit delete action/);
  assert.deepEqual(response.payload.state.products.map((product) => product.id), ["product-1", "product-2", "product-3"]);
  assert.deepEqual(saved, []);
});

test("product deletion guard allows explicit product delete tombstone", async () => {
  const currentState = createState(["product-1", "product-2", "product-3"]);
  const nextState = { ...createState(["product-1", "product-3"]), deletedProductIds: ["product-2"] };
  const saved = [];
  const response = await saveThroughStateApi({
    currentState,
    nextState,
    saved,
    baseUpdatedAt: "2026-06-27T10:00:00.000Z"
  });

  assert.equal(response.status, 200);
  assert.deepEqual(saved[0].products.map((product) => product.id), ["product-1", "product-3"]);
});

test("product deletion guard rejects project loss with products and no tombstones", async () => {
  const currentState = {
    projects: [{ id: "project-1" }, { id: "project-2" }],
    products: [
      { id: "product-1", projectId: "project-1", name: "Первый" },
      { id: "product-2", projectId: "project-2", name: "Второй" }
    ],
    jobs: []
  };
  const nextState = {
    projects: [{ id: "project-1" }],
    products: [{ id: "product-1", projectId: "project-1", name: "Первый" }],
    jobs: []
  };
  const saved = [];
  const response = await saveThroughStateApi({
    currentState,
    nextState,
    saved,
    baseUpdatedAt: "2026-06-27T10:00:00.000Z"
  });

  assert.equal(response.status, 409);
  assert.match(response.payload.error, /Product deletion requires explicit delete action/);
  assert.deepEqual(saved, []);
});

test("product deletion guard allows project loss when all project products have tombstones", async () => {
  const currentState = {
    projects: [{ id: "project-1" }, { id: "project-2" }],
    products: [
      { id: "product-1", projectId: "project-1", name: "Первый" },
      { id: "product-2", projectId: "project-2", name: "Второй" },
      { id: "product-3", projectId: "project-2", name: "Третий" }
    ],
    jobs: []
  };
  const nextState = {
    projects: [{ id: "project-1" }],
    products: [{ id: "product-1", projectId: "project-1", name: "Первый" }],
    jobs: [],
    deletedProductIds: ["product-2", "product-3"]
  };
  const saved = [];
  const response = await saveThroughStateApi({
    currentState,
    nextState,
    saved,
    baseUpdatedAt: "2026-06-27T10:00:00.000Z"
  });

  assert.equal(response.status, 200);
  assert.deepEqual(saved[0].products.map((product) => product.id), ["product-1"]);
});

test("store product creation keeps all project products and no delete tombstones", () => {
  const store = createStore();
  const projectId = store.getState().selectedProjectId;
  const initialCount = store.getState().products.filter((product) => product.projectId === projectId).length;

  store.createProduct({ name: "Второй продукт" });
  store.createProduct({ name: "Третий продукт" });

  const state = store.getState();
  const projectProducts = state.products.filter((product) => product.projectId === projectId);

  assert.equal(projectProducts.length, initialCount + 2);
  assert.deepEqual(state.deletedProductIds || [], []);
});

test("store refuses to delete a product from another project", () => {
  const store = createStore();
  store.createProject({ name: "Второй проект", productName: "Чужой продукт" });
  const foreignProductId = store.getState().selectedProductId;
  store.selectProject("supplements");
  store.createProduct({ name: "Еще продукт выбранного проекта" });

  const result = store.deleteProduct(foreignProductId);
  const state = store.getState();

  assert.deepEqual(result, { ok: false, reason: "wrong-project" });
  assert.equal(state.products.some((product) => product.id === foreignProductId), true);
  assert.equal((state.deletedProductIds || []).includes(foreignProductId), false);
});

test("store project deletion marks every removed project product explicitly", () => {
  const store = createStore();
  store.createProject({ name: "Проект с тремя продуктами", productName: "Первый продукт" });
  const projectId = store.getState().selectedProjectId;
  store.createProduct({ name: "Второй продукт" });
  store.createProduct({ name: "Третий продукт" });

  const removedIds = store.getState().products
    .filter((product) => product.projectId === projectId)
    .map((product) => product.id);
  store.deleteProject(projectId);
  const state = store.getState();

  assert.equal(state.products.some((product) => product.projectId === projectId), false);
  assert.deepEqual(new Set(state.deletedProductIds), new Set(removedIds));
});

function createState(productIds) {
  return {
    projects: [{ id: "project-1", name: "Project" }],
    products: productIds.map((id) => ({ id, projectId: "project-1", name: id })),
    jobs: []
  };
}

async function saveThroughStateApi({ currentState, nextState, saved, baseUpdatedAt }) {
  const response = createJsonResponse();
  const handleStateApi = createStateApiHandler({
    isPostgresConfigured: () => true,
    saveNormalizedState: async (_query, _key, state) => saved.push(state),
    saveLegacyState: async () => ({ rows: [{ updated_at: "2026-06-27T10:01:00.000Z" }] }),
    loadNormalizedState: async () => saved.at(-1) || currentState,
    loadLegacyState: async () => null,
    withPostgresTransaction: async (callback) => callback({
      query: async (text) => {
        if (/select updated_at from app_state/i.test(text)) {
          return { rows: [{ updated_at: "2026-06-27T10:00:00.000Z" }] };
        }
        return { rows: [] };
      }
    })
  });

  await handleStateApi(
    createJsonRequest("POST", { state: nextState, baseUpdatedAt }),
    response,
    new URL("http://localhost/api/state")
  );
  return response;
}

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
