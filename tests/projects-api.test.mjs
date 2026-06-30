import test from "node:test";
import assert from "node:assert/strict";
import { createProjectsApiHandler } from "../scripts/projects-api.mjs";

test("projects api creates one project without replacing existing state", async () => {
  const calls = [];
  const response = createJsonResponse();
  const bundle = {
    project: { id: "new-project", name: "Глобал Трэйд", references: [], characters: [] },
    product: { id: "new-product", projectId: "new-project", name: "Первый продукт" }
  };
  const handle = createProjectsApiHandler({
    isPostgresConfigured: () => true,
    withPostgresTransaction: async (callback) => callback({
      query: async (text, params = []) => {
        calls.push(["query", text, params]);
        return { rows: [] };
      }
    }),
    createProjectForState: async (_query, key, payload) => {
      calls.push(["create", key, payload]);
      return { ...payload, updatedAt: "db-v2" };
    }
  });

  const handled = await handle(
    createJsonRequest("POST", { ...bundle, baseUpdatedAt: "db-v1" }),
    response,
    new URL("http://localhost/api/projects")
  );

  assert.equal(handled, true);
  assert.equal(response.status, 200);
  assert.equal(response.payload.saved, true);
  assert.deepEqual(calls.find((call) => call[0] === "create"), ["create", "default", bundle]);
  assert.equal(response.payload.project.id, "new-project");
  assert.equal(response.payload.product.projectId, "new-project");
});

test("projects api patches one project inside app-state transaction", async () => {
  const calls = [];
  const response = createJsonResponse();
  const handle = createProjectsApiHandler({
    isPostgresConfigured: () => true,
    withPostgresTransaction: async (callback) => callback({
      query: async (text, params = []) => {
        calls.push(["query", text, params]);
        return { rows: [] };
      }
    }),
    saveProjectForState: async (_query, key, projectId, patch) => {
      calls.push(["save", key, projectId, patch]);
      return { project: { id: projectId, name: patch.name }, updatedAt: "db-v2" };
    }
  });

  const handled = await handle(
    createJsonRequest("PATCH", { project: { name: "Новый проект" }, baseUpdatedAt: "db-v1" }),
    response,
    new URL("http://localhost/api/projects/project-1")
  );

  assert.equal(handled, true);
  assert.equal(response.status, 200);
  assert.equal(response.payload.saved, true);
  assert.deepEqual(calls.find((call) => call[0] === "save"), ["save", "default", "project-1", { name: "Новый проект" }]);
});

test("projects api deletes one project through app-state transaction", async () => {
  const calls = [];
  const response = createJsonResponse();
  const handle = createProjectsApiHandler({
    isPostgresConfigured: () => true,
    withPostgresTransaction: async (callback) => callback({
      query: async (text, params = []) => {
        calls.push(["query", text, params]);
        return { rows: [] };
      }
    }),
    deleteProjectForState: async (_query, key, projectId) => {
      calls.push(["delete", key, projectId]);
      return { deletedProjectId: projectId, updatedAt: "db-v2" };
    }
  });

  await handle(
    createJsonRequest("DELETE", { baseUpdatedAt: "db-v1" }),
    response,
    new URL("http://localhost/api/projects/project-1")
  );

  assert.equal(response.status, 200);
  assert.equal(response.payload.saved, true);
  assert.equal(response.payload.deletedProjectId, "project-1");
  assert.deepEqual(calls.find((call) => call[0] === "delete"), ["delete", "default", "project-1"]);
});

test("projects api rejects stale writes with compact conflict state", async () => {
  let saveCalled = false;
  const response = createJsonResponse();
  const currentState = {
    projects: [{ id: "project-1", references: [{ imageData: "data:image/png;base64,AAA" }] }],
    products: [],
    jobs: []
  };
  const handle = createProjectsApiHandler({
    isPostgresConfigured: () => true,
    withPostgresTransaction: async (callback) => callback({
      query: async (text) => {
        if (/updated_at/.test(text)) return { rows: [{ updated_at: "db-v2" }] };
        return { rows: [] };
      }
    }),
    loadNormalizedState: async () => currentState,
    loadLegacyState: async () => null,
    saveProjectForState: async () => {
      saveCalled = true;
      return {};
    }
  });

  await handle(
    createJsonRequest("PATCH", { project: { name: "Stale" }, baseUpdatedAt: "db-v1" }),
    response,
    new URL("http://localhost/api/projects/project-1")
  );

  assert.equal(response.status, 409);
  assert.equal(response.payload.conflict, true);
  assert.equal(response.payload.state.projects[0].references[0].imageData, "");
  assert.equal(saveCalled, false);
});

test("projects api rejects stale project create/delete without writing", async () => {
  for (const method of ["POST", "DELETE"]) {
    let wrote = false;
    const response = createJsonResponse();
    const handle = createProjectsApiHandler({
      isPostgresConfigured: () => true,
      withPostgresTransaction: async (callback) => callback({
        query: async (text) => {
          if (/updated_at/.test(text)) return { rows: [{ updated_at: "db-v2" }] };
          return { rows: [] };
        }
      }),
      loadNormalizedState: async () => ({ projects: [{ id: "molecular" }], products: [], jobs: [] }),
      loadLegacyState: async () => null,
      createProjectForState: async () => {
        wrote = true;
        return {};
      },
      deleteProjectForState: async () => {
        wrote = true;
        return {};
      }
    });

    await handle(
      createJsonRequest(method, { project: { id: "new-project" }, product: { id: "new-product", projectId: "new-project" }, baseUpdatedAt: "db-v1" }),
      response,
      new URL(method === "POST" ? "http://localhost/api/projects" : "http://localhost/api/projects/molecular")
    );

    assert.equal(response.status, 409);
    assert.equal(response.payload.state.projects[0].id, "molecular");
    assert.equal(wrote, false);
  }
});

test("projects api keeps local fallback when postgres is disabled", async () => {
  const response = createJsonResponse();
  const handle = createProjectsApiHandler({ isPostgresConfigured: () => false });

  await handle(
    createJsonRequest("PATCH", { project: { name: "Local" } }),
    response,
    new URL("http://localhost/api/projects/project-1")
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
