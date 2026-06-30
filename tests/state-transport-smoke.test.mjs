import test from "node:test";
import assert from "node:assert/strict";
import { createStateApiHandler } from "../scripts/state-api.mjs";

test("state api compact transport strips embedded blobs by default", async () => {
  const state = createHeavyState();
  const response = createJsonResponse();
  const handle = createStateApiHandler({
    isPostgresConfigured: () => true,
    loadNormalizedState: async () => state,
    loadLegacyState: async () => null,
    queryPostgres: async () => ({ rows: [{ updated_at: "2026-06-30T20:00:00.000Z" }] }),
    withPostgresTransaction: async () => {
      throw new Error("GET should not open a transaction");
    }
  });

  await handle({ method: "GET" }, response, new URL("http://localhost/api/state"));

  assert.equal(response.status, 200);
  assert.equal(response.payload.transport.mode, "compact");
  assert.equal(response.payload.state.projects[0].references[0].imageData, "");
  assert.equal(response.payload.state.projects[0].references[1].imageData, "https://cdn.example.com/ref.png");
  assert.equal(response.payload.state.projects[0].audioLibrary[0].fileData, "");
  assert.equal(response.payload.state.products[0].references[0].imageData, "");
  assert.equal(response.payload.state.audioLibrary[0].fileData, "");
  assert.equal(response.payload.state.jobs[0].imageData, "");
  assert.deepEqual(response.payload.state.jobs[0].inputUrls, ["https://cdn.example.com/input.png"]);
  assert.equal(response.payload.state.jobs[0].serverJobContext.project.characters[0].imageData, "");
  assert.equal(response.payload.state.jobs[0].serverJobContext.product.references[0].imageData, "");
  assert.equal(response.payload.transport.savedBytes > 0, true);
});

test("state api can return full transport explicitly for diagnostics", async () => {
  const state = createHeavyState();
  const response = createJsonResponse();
  const handle = createStateApiHandler({
    isPostgresConfigured: () => true,
    loadNormalizedState: async () => state,
    loadLegacyState: async () => null,
    queryPostgres: async () => ({ rows: [{ updated_at: "2026-06-30T20:00:00.000Z" }] }),
    withPostgresTransaction: async () => {
      throw new Error("GET should not open a transaction");
    }
  });

  await handle({ method: "GET" }, response, new URL("http://localhost/api/state?transport=full"));

  assert.equal(response.status, 200);
  assert.equal(response.payload.transport.mode, "full");
  assert.match(response.payload.state.projects[0].references[0].imageData, /^data:image\//);
  assert.match(response.payload.state.audioLibrary[0].fileData, /^data:audio\//);
});

test("state api compact transport protects conflict payloads from heavy state echoes", async () => {
  const state = createHeavyState();
  const response = createJsonResponse();
  const handle = createStateApiHandler({
    isPostgresConfigured: () => true,
    saveNormalizedState: async () => {
      throw new Error("stale save should not write");
    },
    saveLegacyState: async () => {
      throw new Error("stale save should not write");
    },
    loadNormalizedState: async () => state,
    loadLegacyState: async () => null,
    withPostgresTransaction: async (callback) => callback({
      query: async (text) => {
        if (/select updated_at from app_state/i.test(text)) return { rows: [{ updated_at: "db-v2" }] };
        return { rows: [] };
      }
    })
  });

  await handle(
    createJsonRequest("POST", { state: { projects: [], products: [], jobs: [] }, baseUpdatedAt: "db-v1" }),
    response,
    new URL("http://localhost/api/state")
  );

  assert.equal(response.status, 409);
  assert.equal(response.payload.transport.mode, "compact");
  assert.equal(response.payload.state.projects[0].references[0].imageData, "");
  assert.equal(response.payload.state.products[0].references[0].imageData, "");
});

function createHeavyState() {
  return {
    projects: [{
      id: "project-1",
      references: [
        { id: "ref-local", imageData: "data:image/png;base64,AAA" },
        { id: "ref-remote", imageData: "https://cdn.example.com/ref.png" }
      ],
      audioLibrary: [{ id: "audio-project", fileData: "data:audio/mp3;base64,BBB" }],
      avatarCandidates: [],
      designReferenceCandidates: [],
      characters: []
    }],
    products: [{
      id: "product-1",
      projectId: "project-1",
      references: [{ id: "product-ref", imageData: "data:image/png;base64,CCC" }]
    }],
    audioLibrary: [{ id: "audio-global", fileData: "data:audio/mp3;base64,DDD" }],
    jobs: [{
      id: "job-1",
      projectId: "project-1",
      imageUrl: "https://cdn.example.com/job.png",
      imageData: "https://cdn.example.com/job.png",
      inputUrls: ["data:image/png;base64,EEE", "https://cdn.example.com/input.png"],
      serverJobContext: {
        project: {
          id: "project-1",
          references: [],
          audioLibrary: [],
          avatarCandidates: [],
          designReferenceCandidates: [],
          characters: [{ id: "char-1", imageData: "data:image/png;base64,FFF" }]
        },
        product: {
          id: "product-1",
          references: [{ id: "context-product-ref", imageData: "data:image/png;base64,GGG" }]
        },
        products: [{
          id: "product-1",
          references: [{ id: "context-product-list-ref", imageData: "data:image/png;base64,HHH" }]
        }]
      }
    }]
  };
}

function createJsonResponse() {
  return {
    status: 0,
    payload: null,
    writeHead(status) {
      this.status = status;
    },
    end(body) {
      this.payload = JSON.parse(body);
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
