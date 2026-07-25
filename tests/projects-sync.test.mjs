import test from "node:test";
import assert from "node:assert/strict";
import { updateRemoteProjectResource } from "../src/services/projects-sync.js";

test("updateRemoteProjectResource sends only resource payload", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    return jsonResponse({ saved: true, project: { id: "project 1" }, resource: "automation", updatedAt: "db-next" });
  };

  try {
    const result = await updateRemoteProjectResource("project 1", "automation", { automation: { enabled: true } }, "db-v1");

    assert.equal(calls[0].url, "/api/projects/project%201/automation");
    assert.equal(calls[0].options.method, "PATCH");
    assert.deepEqual(JSON.parse(calls[0].options.body), {
      payload: { automation: { enabled: true } },
      baseUpdatedAt: "db-v1"
    });
    assert.equal(result.updatedAt, "db-next");
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
