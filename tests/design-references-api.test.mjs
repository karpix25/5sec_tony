import test from "node:test";
import assert from "node:assert/strict";
import { createDesignReferencesApiHandler } from "../scripts/design-references-api.mjs";

test("design references api creates one project reference inside app-state transaction", async () => {
  const calls = [];
  const response = createJsonResponse();
  const handle = createDesignReferencesApiHandler({
    isPostgresConfigured: () => true,
    withPostgresTransaction: async (callback) => callback({ query: async () => ({ rows: [] }) }),
    createDesignReferenceForState: async (_query, key, projectId, reference) => {
      calls.push(["create", key, projectId, reference]);
      return { reference: { ...reference, id: "ref-db" }, project: { id: projectId }, updatedAt: "db-v2" };
    }
  });

  const handled = await handle(
    createJsonRequest("POST", { reference: { title: "Русский стиль" }, baseUpdatedAt: "db-v1" }),
    response,
    new URL("http://localhost/api/projects/project-1/design-references")
  );

  assert.equal(handled, true);
  assert.equal(response.status, 200);
  assert.equal(response.payload.saved, true);
  assert.equal(response.payload.reference.id, "ref-db");
  assert.deepEqual(calls[0], ["create", "default", "project-1", { title: "Русский стиль" }]);
});

test("design references api approves generated candidate through backend", async () => {
  const calls = [];
  const response = createJsonResponse();
  const handle = createDesignReferencesApiHandler({
    isPostgresConfigured: () => true,
    withPostgresTransaction: async (callback) => callback({ query: async () => ({ rows: [] }) }),
    approveDesignReferenceCandidateForState: async (_query, key, projectId, candidateId) => {
      calls.push(["approve", key, projectId, candidateId]);
      return {
        reference: { id: "ref-approved", title: "Approved" },
        deletedCandidateId: candidateId,
        project: { id: projectId },
        updatedAt: "db-v2"
      };
    }
  });

  await handle(
    createJsonRequest("POST", { baseUpdatedAt: "db-v1" }),
    response,
    new URL("http://localhost/api/projects/project-1/design-reference-candidates/candidate-1/approve")
  );

  assert.equal(response.status, 200);
  assert.equal(response.payload.reference.id, "ref-approved");
  assert.equal(response.payload.deletedCandidateId, "candidate-1");
  assert.deepEqual(calls[0], ["approve", "default", "project-1", "candidate-1"]);
});

test("design references api accepts stale app-state versions for isolated reference writes", async () => {
  let wrote = false;
  const response = createJsonResponse();
  const handle = createDesignReferencesApiHandler({
    isPostgresConfigured: () => true,
    withPostgresTransaction: async (callback) => callback({
      query: async (text) => /updated_at/.test(text) ? { rows: [{ updated_at: "db-v2" }] } : { rows: [] }
    }),
    loadLegacyState: async () => null,
    updateDesignReferenceForState: async (_query, _key, projectId, referenceId, patch) => {
      wrote = true;
      return { reference: { id: referenceId, ...patch }, project: { id: projectId }, updatedAt: "db-v3" };
    }
  });

  await handle(
    createJsonRequest("PATCH", { reference: { title: "Stale" }, baseUpdatedAt: "db-v1" }),
    response,
    new URL("http://localhost/api/projects/project-1/design-references/ref-1")
  );

  assert.equal(response.status, 200);
  assert.equal(response.payload.saved, true);
  assert.equal(response.payload.reference.title, "Stale");
  assert.equal(wrote, true);
});


test("design references api accepts patch payloads and explicit reject route", async () => {
  const calls = [];
  const patchResponse = createJsonResponse();
  const rejectResponse = createJsonResponse();
  const handle = createDesignReferencesApiHandler({
    isPostgresConfigured: () => true,
    withPostgresTransaction: async (callback) => callback({ query: async () => ({ rows: [] }) }),
    updateDesignReferenceForState: async (_query, key, projectId, referenceId, patch) => {
      calls.push(["patch", key, projectId, referenceId, patch]);
      return { reference: { id: referenceId, ...patch }, project: { id: projectId }, updatedAt: "db-v2" };
    },
    rejectDesignReferenceCandidateForState: async (_query, key, projectId, candidateId) => {
      calls.push(["reject", key, projectId, candidateId]);
      return { deletedCandidateId: candidateId, project: { id: projectId }, updatedAt: "db-v3" };
    }
  });

  await handle(
    createJsonRequest("PATCH", { patch: { title: "Обновлено" }, baseUpdatedAt: "db-v1" }),
    patchResponse,
    new URL("http://localhost/api/projects/project-1/design-references/ref-1")
  );
  await handle(
    createJsonRequest("DELETE", { baseUpdatedAt: "db-v2" }),
    rejectResponse,
    new URL("http://localhost/api/projects/project-1/design-reference-candidates/candidate-1/reject")
  );

  assert.equal(patchResponse.status, 200);
  assert.equal(rejectResponse.status, 200);
  assert.deepEqual(calls[0], ["patch", "default", "project-1", "ref-1", { title: "Обновлено" }]);
  assert.deepEqual(calls[1], ["reject", "default", "project-1", "candidate-1"]);
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
