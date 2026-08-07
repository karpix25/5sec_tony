import test from "node:test";
import assert from "node:assert/strict";
import { createProjectsApiHandler } from "../scripts/projects-api.mjs";
import { createStateApiHandler } from "../scripts/state-api.mjs";

test("state meta api reads only app-state metadata", async () => {
  const calls = [];
  const response = createJsonResponse();
  const handle = createStateApiHandler({
    isPostgresConfigured: () => true,
    queryPostgres: async (text, params) => {
      calls.push([text, params]);
      return { rows: [{ updated_at: "2026-08-07T18:00:00.000Z" }] };
    },
    loadNormalizedState: async () => { throw new Error("full state must not load"); }
  });

  await handle({ method: "GET" }, response, new URL("http://localhost/api/state/meta"));

  assert.equal(response.status, 200);
  assert.deepEqual(response.payload, {
    key: "default",
    updatedAt: "2026-08-07T18:00:00.000Z",
    refreshUpdatedAt: "2026-08-07T18:00:00.000Z",
    catalogUpdatedAt: "2026-08-07T18:00:00.000Z"
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0][0], /^select greatest/i);
  assert.match(calls[0][0], /studio_jobs/i);
  assert.doesNotMatch(calls[0][0], /\bdata\b/i);
});

test("project get api returns one project and its first product without a transaction", async () => {
  const calls = [];
  const response = createJsonResponse();
  const handle = createProjectsApiHandler({
    isPostgresConfigured: () => true,
    queryPostgres: async (text, params) => {
      calls.push([text, params]);
      return { rows: [{
        id: "project-1",
        name: "Новый проект",
        extra: {},
        automation: {},
        cta_overlay: {},
        references: [],
        audio_library: [],
        avatar_candidates: [],
        design_reference_candidates: [],
        characters: [],
        product_row: {
          id: "product-1",
          project_id: "project-1",
          sort_order: 0,
          name: "Первый продукт",
          pains: [],
          facts: [],
          forbidden: [],
          ai_passport: {},
          references: [],
          extra: {}
        },
        app_state_updated_at: "2026-08-07T18:01:00.000Z",
        refresh_updated_at: "2026-08-07T18:00:30.000Z"
      }] };
    },
    withPostgresTransaction: async () => { throw new Error("GET must not open a transaction"); }
  });

  await handle({ method: "GET" }, response, new URL("http://localhost/api/projects/project-1"));

  assert.equal(response.status, 200);
  assert.equal(response.payload.project.id, "project-1");
  assert.equal(response.payload.product.id, "product-1");
  assert.equal(response.payload.updatedAt, "2026-08-07T18:01:00.000Z");
  assert.equal(response.payload.refreshUpdatedAt, "2026-08-07T18:00:30.000Z");
  assert.equal(calls.length, 1);
  assert.doesNotMatch(calls[0][0], /select \* from studio_jobs|\bdata\b/i);
  assert.deepEqual(calls[0][1], ["default", "project-1"]);
});

test("project get api returns 404 when project is absent", async () => {
  const response = createJsonResponse();
  const handle = createProjectsApiHandler({
    isPostgresConfigured: () => true,
    queryPostgres: async () => ({ rows: [] })
  });

  await handle({ method: "GET" }, response, new URL("http://localhost/api/projects/missing"));

  assert.equal(response.status, 404);
  assert.deepEqual(response.payload, { error: "Project not found" });
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
