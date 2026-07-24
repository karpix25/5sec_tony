import test from "node:test";
import assert from "node:assert/strict";
import { createInitialState } from "../src/state/initial-state.js";
import { createStore } from "../src/state/store.js";

test("design reference delete and create run in order and create uses the fresh db version", async () => {
  const initialState = createInitialState();
  let remoteState = initialState;
  let remoteUpdatedAt = "t0";
  let deleteResolved = false;
  const calls = [];
  const projectId = initialState.selectedProjectId;
  const deletedReferenceId = initialState.projects.find((project) => project.id === projectId).references[0].id;

  const { restore } = installFetch(async (url, options = {}) => {
    calls.push({ url, options });
    if (isStateGet(url, options)) return jsonResponse({ state: remoteState, updatedAt: remoteUpdatedAt });
    if (url === `/api/projects/${projectId}/design-references/${deletedReferenceId}` && options.method === "DELETE") {
      assert.equal(JSON.parse(options.body).baseUpdatedAt, "t0");
      await wait(25);
      remoteState = patchProject(remoteState, projectId, (project) => ({
        ...project,
        references: project.references.filter((reference) => reference.id !== deletedReferenceId)
      }));
      remoteUpdatedAt = "t1";
      deleteResolved = true;
      return jsonResponse({
        saved: true,
        deletedReferenceId,
        project: remoteState.projects.find((project) => project.id === projectId),
        updatedAt: remoteUpdatedAt
      });
    }
    if (url === `/api/projects/${projectId}/design-references` && options.method === "POST") {
      assert.equal(deleteResolved, true);
      assert.equal(JSON.parse(options.body).baseUpdatedAt, "t1");
      const reference = { ...JSON.parse(options.body).reference, id: "server-created-ref" };
      remoteState = patchProject(remoteState, projectId, (project) => ({
        ...project,
        references: [reference, ...project.references]
      }));
      remoteUpdatedAt = "t2";
      return jsonResponse({
        saved: true,
        reference,
        project: remoteState.projects.find((project) => project.id === projectId),
        updatedAt: remoteUpdatedAt
      });
    }
    if (isStatePost(url, options)) return jsonResponse({ error: "full state save should not run" }, 500);
    return jsonResponse({ error: `unexpected ${url}` }, 500);
  });

  try {
    const store = createStore();
    await store.whenHydrated();

    const deleted = store.deleteReference(deletedReferenceId);
    const created = store.createReference({
      id: "client-created-ref",
      title: "Новый после удаления",
      imageData: "https://cdn.example.com/new.png"
    });

    await Promise.all([deleted, created]);

    const project = store.getState().projects.find((item) => item.id === projectId);
    assert.equal(project.references.some((reference) => reference.id === deletedReferenceId), false);
    assert.equal(project.references[0].id, "server-created-ref");
    assert.deepEqual(
      calls
        .filter((call) => call.url.includes("/design-references"))
        .map((call) => call.options.method),
      ["DELETE", "POST"]
    );
    assert.equal(calls.some((call) => isStatePost(call.url, call.options)), false);
    assert.deepEqual(store.getOperations(), {});
  } finally {
    restore();
  }
});

test("double-click delete sends only one remote delete for the same design reference", async () => {
  const initialState = createInitialState();
  let remoteState = initialState;
  let remoteUpdatedAt = "t0";
  const calls = [];
  const projectId = initialState.selectedProjectId;
  const deletedReferenceId = initialState.projects.find((project) => project.id === projectId).references[0].id;

  const { restore } = installFetch(async (url, options = {}) => {
    calls.push({ url, options });
    if (isStateGet(url, options)) return jsonResponse({ state: remoteState, updatedAt: remoteUpdatedAt });
    if (url === `/api/projects/${projectId}/design-references/${deletedReferenceId}` && options.method === "DELETE") {
      await wait(20);
      remoteState = patchProject(remoteState, projectId, (project) => ({
        ...project,
        references: project.references.filter((reference) => reference.id !== deletedReferenceId)
      }));
      remoteUpdatedAt = "t1";
      return jsonResponse({
        saved: true,
        deletedReferenceId,
        project: remoteState.projects.find((project) => project.id === projectId),
        updatedAt: remoteUpdatedAt
      });
    }
    if (isStatePost(url, options)) return jsonResponse({ error: "full state save should not run" }, 500);
    return jsonResponse({ error: `unexpected ${url}` }, 500);
  });

  try {
    const store = createStore();
    await store.whenHydrated();

    const firstDelete = store.deleteReference(deletedReferenceId);
    const secondDelete = store.deleteReference(deletedReferenceId);
    const results = await Promise.all([firstDelete, secondDelete]);

    assert.equal(results[0].references.some((reference) => reference.id === deletedReferenceId), false);
    assert.equal(results[1], null);
    assert.equal(
      calls.filter((call) => call.url === `/api/projects/${projectId}/design-references/${deletedReferenceId}` && call.options.method === "DELETE").length,
      1
    );
    assert.equal(calls.some((call) => isStatePost(call.url, call.options)), false);
    assert.deepEqual(store.getOperations(), {});
  } finally {
    restore();
  }
});

test("stale remote conflict during replace restores server state without a late unhandled rejection", async () => {
  const initialState = createInitialState();
  const projectId = initialState.selectedProjectId;
  const referenceId = initialState.projects.find((project) => project.id === projectId).references[0].id;
  const remoteConflictState = patchProject(initialState, projectId, (project) => ({
    ...project,
    references: project.references.map((reference) =>
      reference.id === referenceId
        ? { ...reference, title: "Сервер победил", imageData: "https://cdn.example.com/server.png" }
        : reference
    )
  }));
  const calls = [];

  const { restore } = installFetch(async (url, options = {}) => {
    calls.push({ url, options });
    if (isStateGet(url, options)) return jsonResponse({ state: initialState, updatedAt: "t0" });
    if (url === `/api/projects/${projectId}/design-references/${referenceId}` && options.method === "PATCH") {
      assert.equal(JSON.parse(options.body).baseUpdatedAt, "t0");
      return jsonResponse({ conflict: true, state: remoteConflictState, updatedAt: "t2" }, 409);
    }
    if (isStatePost(url, options)) return jsonResponse({ error: "full state save should not run" }, 500);
    return jsonResponse({ error: `unexpected ${url}` }, 500);
  });

  try {
    const store = createStore();
    await store.whenHydrated();

    await assert.rejects(
      store.replaceDesignReference(referenceId, {
        title: "Локальная замена",
        imageData: "https://cdn.example.com/local.png"
      }),
      (error) => error?.conflict === true
    );

    const project = store.getState().projects.find((item) => item.id === projectId);
    const reference = project.references.find((item) => item.id === referenceId);
    const operations = Object.values(store.getOperations());

    assert.equal(reference.title, "Сервер победил");
    assert.equal(reference.imageData, "https://cdn.example.com/server.png");
    assert.equal(operations.length, 1);
    assert.equal(operations[0].kind, "replace");
    assert.equal(operations[0].targetId, referenceId);
    assert.equal(operations[0].status, "failed");
    assert.equal(calls.some((call) => isStatePost(call.url, call.options)), false);
    assert.equal(store.getPersistenceStatus().status, "conflict");
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

function patchProject(state, projectId, updateProject) {
  return {
    ...state,
    projects: state.projects.map((project) => project.id === projectId ? updateProject(project) : project)
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
