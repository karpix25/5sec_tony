import test from "node:test";
import assert from "node:assert/strict";
import { createInitialState } from "../src/state/initial-state.js";
import { createStore } from "../src/state/store.js";

test("remote project create keeps existing projects and skips full state save", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const remoteState = createInitialState();
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url === "/api/state" && (!options.method || options.method === "GET")) {
      return jsonResponse({ state: remoteState, updatedAt: "t0" });
    }
    if (url === "/api/projects" && options.method === "POST") {
      const body = JSON.parse(options.body);
      return jsonResponse({ saved: true, project: body.project, product: body.product, updatedAt: "t1" });
    }
    if (url === "/api/state" && options.method === "POST") {
      return jsonResponse({ error: "full state save should not be used for project create" }, 500);
    }
    return jsonResponse({ error: `unexpected ${url}` }, 500);
  };

  try {
    const store = createStore();
    await store.whenHydrated();
    calls.length = 0;

    await store.createProjectRemote({ name: "Глобал Трэйд", productName: "Мишидо" });
    await wait(320);

    const state = store.getState();
    assert.equal(state.projects.some((project) => project.id === remoteState.selectedProjectId), true);
    assert.equal(state.projects.some((project) => project.name === "Глобал Трэйд"), true);
    assert.equal(calls.filter((call) => call.url === "/api/state" && call.options.method === "POST").length, 0);
    assert.equal(JSON.parse(calls.find((call) => call.url === "/api/projects").options.body).baseUpdatedAt, "t0");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("remote project delete removes only requested project and skips full state save", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const remoteState = createInitialState();
  const deletedId = remoteState.projects[1].id;
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url === "/api/state" && (!options.method || options.method === "GET")) {
      return jsonResponse({ state: remoteState, updatedAt: "t0" });
    }
    if (String(url).startsWith("/api/projects/") && options.method === "DELETE") {
      return jsonResponse({ saved: true, deletedProjectId: deletedId, updatedAt: "t1" });
    }
    if (url === "/api/state" && options.method === "POST") {
      return jsonResponse({ error: "full state save should not be used for project delete" }, 500);
    }
    return jsonResponse({ error: `unexpected ${url}` }, 500);
  };

  try {
    const store = createStore();
    await store.whenHydrated();
    calls.length = 0;

    await store.deleteProjectRemote(deletedId);
    await wait(320);

    const state = store.getState();
    assert.equal(state.projects.some((project) => project.id === deletedId), false);
    assert.equal(state.projects.some((project) => project.id === remoteState.selectedProjectId), true);
    assert.equal(state.products.some((product) => product.projectId === deletedId), false);
    assert.equal(calls.filter((call) => call.url === "/api/state" && call.options.method === "POST").length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("stale remote project create refreshes state instead of overwriting", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const remoteState = createInitialState();
  const freshState = {
    ...remoteState,
    projects: remoteState.projects.map((project, index) =>
      index === 0 ? { ...project, name: "Molecular из БД" } : project
    )
  };
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url === "/api/state" && (!options.method || options.method === "GET")) {
      return jsonResponse({ state: remoteState, updatedAt: "t0" });
    }
    if (url === "/api/projects" && options.method === "POST") {
      return jsonResponse({ conflict: true, updatedAt: "t1", state: freshState }, 409);
    }
    return jsonResponse({ error: `unexpected ${url}` }, 500);
  };

  try {
    const store = createStore();
    await store.whenHydrated();
    calls.length = 0;

    await assert.rejects(() => store.createProjectRemote({ name: "Глобал Трэйд" }), /Postgres|БД обновлена/);
    await wait(20);

    assert.equal(store.getState().projects[0].name, "Molecular из БД");
    assert.equal(calls.filter((call) => call.url === "/api/state" && call.options.method === "POST").length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("remote project update falls back to pending state save on network failure", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const remoteState = createInitialState();
  const nextName = "Локально сохраненный проект";
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url === "/api/state" && (!options.method || options.method === "GET")) {
      return jsonResponse({ state: remoteState, updatedAt: "t0" });
    }
    if (String(url).startsWith("/api/projects/") && options.method === "PATCH") {
      throw new TypeError("Failed to fetch");
    }
    if (url === "/api/state" && options.method === "POST") {
      return jsonResponse({ saved: true, updatedAt: "t1" });
    }
    return jsonResponse({ error: `unexpected ${url}` }, 500);
  };

  try {
    const store = createStore();
    await store.whenHydrated();
    calls.length = 0;

    await store.updateProjectSettingsRemote({ name: nextName });
    await wait(360);

    const state = store.getState();
    const project = state.projects.find((item) => item.id === state.selectedProjectId);
    const stateSaves = calls.filter((call) => call.url === "/api/state" && call.options.method === "POST");
    const savedBody = JSON.parse(stateSaves[0].options.body);
    assert.equal(project.name, nextName);
    assert.equal(stateSaves.length, 1);
    assert.equal(savedBody.baseUpdatedAt, "t0");
    assert.equal(savedBody.state.projects.find((item) => item.id === state.selectedProjectId).name, nextName);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("remote project update reapplies settings after stale conflict", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const remoteState = createInitialState();
  const selectedProjectId = remoteState.selectedProjectId;
  const freshState = {
    ...remoteState,
    projects: remoteState.projects.map((project) =>
      project.id === selectedProjectId ? { ...project, projectLimit: 21, usedTotal: 21 } : project
    )
  };
  let patchCount = 0;
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url === "/api/state" && (!options.method || options.method === "GET")) {
      return jsonResponse({ state: remoteState, updatedAt: "t0" });
    }
    if (String(url).startsWith("/api/projects/") && options.method === "PATCH") {
      patchCount += 1;
      const body = JSON.parse(options.body);
      if (patchCount === 1) {
        assert.equal(body.baseUpdatedAt, "t0");
        assert.equal(body.projectLimitBase, remoteState.projects.find((item) => item.id === selectedProjectId).projectLimit);
        return jsonResponse({ conflict: true, updatedAt: "t1", state: freshState }, 409);
      }
      assert.equal(body.baseUpdatedAt, "t1");
      assert.equal(body.project.projectLimit, 25);
      assert.equal(body.projectLimitBase, remoteState.projects.find((item) => item.id === selectedProjectId).projectLimit);
      return jsonResponse({ saved: true, project: body.project, updatedAt: "t2" });
    }
    if (url === "/api/state" && options.method === "POST") {
      return jsonResponse({ error: "full state save should not be used for project update conflict retry" }, 500);
    }
    return jsonResponse({ error: `unexpected ${url}` }, 500);
  };

  try {
    const store = createStore();
    await store.whenHydrated();
    calls.length = 0;

    await store.updateProjectSettingsRemote({ projectLimit: "25" });
    await wait(320);

    const project = store.getState().projects.find((item) => item.id === selectedProjectId);
    assert.equal(project.projectLimit, 25);
    assert.equal(patchCount, 2);
    assert.equal(calls.filter((call) => call.url === "/api/state" && call.options.method === "POST").length, 0);
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
