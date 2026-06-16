import test from "node:test";
import assert from "node:assert/strict";
import { handleStateApi } from "../scripts/state-api.mjs";

test("state api load is safe when postgres is not configured", async () => {
  const response = createJsonResponse();
  const handled = await handleStateApi(
    { method: "GET" },
    response,
    new URL("http://localhost/api/state")
  );

  assert.equal(handled, true);
  assert.equal(response.status, 200);
  assert.deepEqual(response.payload, { state: null, disabled: true, reason: "postgres_not_configured" });
});

test("state api save is safe when postgres is not configured", async () => {
  const response = createJsonResponse();
  const handled = await handleStateApi(
    createJsonRequest("POST", { state: { projects: [] } }),
    response,
    new URL("http://localhost/api/state")
  );

  assert.equal(handled, true);
  assert.equal(response.status, 200);
  assert.equal(response.payload.saved, false);
  assert.equal(response.payload.disabled, true);
});

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
  const listeners = {};
  return {
    method,
    on(event, callback) {
      listeners[event] = callback;
      if (event === "end") {
        queueMicrotask(() => {
          listeners.data?.(JSON.stringify(body));
          listeners.end?.();
        });
      }
    }
  };
}
