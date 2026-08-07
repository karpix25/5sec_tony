import test from "node:test";
import assert from "node:assert/strict";
import { createInitialState } from "../src/state/initial-state.js";
import { createStore } from "../src/state/store.js";

test("remote project create still uses its endpoint while a full save is pending", async () => {
  const originalFetch = globalThis.fetch;
  const remoteState = createInitialState();
  const calls = [];
  let releaseStateSave;
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url === "/api/state" && (!options.method || options.method === "GET")) {
      return jsonResponse({ state: remoteState, updatedAt: "t0" });
    }
    if (url === "/api/state" && options.method === "POST") {
      await new Promise((resolve) => { releaseStateSave = resolve; });
      return jsonResponse({ saved: true, updatedAt: "t1" });
    }
    if (url === "/api/projects" && options.method === "POST") {
      const body = JSON.parse(options.body);
      return jsonResponse({ saved: true, project: body.project, product: body.product, updatedAt: "t2" });
    }
    return jsonResponse({ error: `unexpected ${url}` }, 500);
  };

  try {
    const store = createStore();
    await store.whenHydrated();
    store.updateProjectSettings({ companyInfo: "Запускаем полное сохранение" });
    await wait(300);
    const project = await store.createProjectRemote({ name: "Параллельный проект", productName: "Продукт" });

    assert.equal(store.getState().selectedProjectId, project.id);
    assert.equal(calls.some((call) => call.url === "/api/projects" && call.options.method === "POST"), true);
    releaseStateSave();
    await wait(20);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function jsonResponse(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
