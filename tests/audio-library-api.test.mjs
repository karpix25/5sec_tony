import test from "node:test";
import assert from "node:assert/strict";
import { createAudioLibraryApiHandler } from "../scripts/audio-library-api.mjs";

test("audio library api appends assets inside app-state transaction", async () => {
  const calls = [];
  const response = createJsonResponse();
  const handle = createAudioLibraryApiHandler({
    isPostgresConfigured: () => true,
    withPostgresTransaction: async (callback) => callback({
      query: async (text, params = []) => {
        calls.push(["query", text, params]);
        return { rows: [] };
      }
    }),
    appendAudioAssetToState: async (_audio, _deps) => ({ id: "audio-1", updatedAt: "db-v2" })
  });

  await handle(
    createJsonRequest("POST", { assets: [{ id: "audio-1" }], baseUpdatedAt: "db-v1" }),
    response,
    new URL("http://localhost/api/audio-library")
  );

  assert.equal(response.status, 200);
  assert.equal(response.payload.saved, true);
  assert.equal(response.payload.assets[0].id, "audio-1");
  assert.match(calls[0][1], /pg_advisory_xact_lock/);
});

test("audio library api rejects stale deletes before writing", async () => {
  let deleteCalled = false;
  const response = createJsonResponse();
  const currentState = { audioLibrary: [{ id: "audio-1", fileData: "data:audio/mp3;base64,AAA" }] };
  const handle = createAudioLibraryApiHandler({
    isPostgresConfigured: () => true,
    withPostgresTransaction: async (callback) => callback({
      query: async (text) => {
        if (/updated_at/.test(text)) return { rows: [{ updated_at: "db-v2" }] };
        return { rows: [] };
      }
    }),
    loadNormalizedState: async () => currentState,
    loadLegacyState: async () => null,
    deleteAudioAssetFromState: async () => {
      deleteCalled = true;
      return {};
    }
  });

  await handle(
    createJsonRequest("DELETE", { baseUpdatedAt: "db-v1" }),
    response,
    new URL("http://localhost/api/audio-library/audio-1")
  );

  assert.equal(response.status, 409);
  assert.equal(response.payload.conflict, true);
  assert.equal(response.payload.state.audioLibrary[0].fileData, "");
  assert.equal(deleteCalled, false);
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
