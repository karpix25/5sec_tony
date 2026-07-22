import test from "node:test";
import assert from "node:assert/strict";
import { StateSyncConflictError } from "../src/services/state-sync.js";
import {
  DesignReferenceEndpointUnavailableError,
  createRemoteDesignReference,
  deleteRemoteDesignReference,
  updateRemoteDesignReference
} from "../src/services/design-references-sync.js";

test("createRemoteDesignReference sends a small project-scoped reference payload", async () => {
  const restore = mockFetch(async (url, options) => {
    assert.equal(url, "/api/projects/project%201/design-references");
    assert.equal(options.method, "POST");
    assert.equal(options.keepalive, true);
    return jsonResponse({ saved: true, reference: JSON.parse(options.body).reference, updatedAt: "db-next" });
  });

  try {
    const result = await createRemoteDesignReference("project 1", { id: "ref-1", title: "Русский реф" }, "db-v1");

    assert.equal(result.saved, true);
    assert.equal(result.reference.title, "Русский реф");
    assert.equal(result.updatedAt, "db-next");
  } finally {
    restore();
  }
});

test("updateRemoteDesignReference sends only the patch", async () => {
  const restore = mockFetch(async (url, options) => {
    assert.equal(url, "/api/projects/project-1/design-references/ref-1");
    assert.equal(options.method, "PATCH");
    assert.deepEqual(JSON.parse(options.body), { patch: { title: "Обновлено" }, baseUpdatedAt: "db-v1" });
    return jsonResponse({ saved: true, reference: { id: "ref-1", title: "Обновлено" }, updatedAt: "db-v2" });
  });

  try {
    const result = await updateRemoteDesignReference("project-1", "ref-1", { title: "Обновлено" }, "db-v1");
    assert.equal(result.reference.title, "Обновлено");
  } finally {
    restore();
  }
});

test("deleteRemoteDesignReference preserves sync conflict details", async () => {
  const restore = mockFetch(async () => jsonResponse({ conflict: true, updatedAt: "db-v2", state: { projects: [] } }, 409));

  try {
    await assert.rejects(
      () => deleteRemoteDesignReference("project-1", "ref-1", "db-v1"),
      (error) => {
        assert.equal(error instanceof StateSyncConflictError, true);
        assert.equal(error.updatedAt, "db-v2");
        return true;
      }
    );
  } finally {
    restore();
  }
});

test("design reference service marks missing backend endpoint as fallback-safe", async () => {
  const restore = mockFetch(async () => jsonResponse({ error: "not found" }, 404));

  try {
    await assert.rejects(
      () => updateRemoteDesignReference("project-1", "ref-1", { title: "x" }),
      (error) => error instanceof DesignReferenceEndpointUnavailableError && error.endpointUnavailable
    );
  } finally {
    restore();
  }
});

function mockFetch(handler) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = handler;
  return () => {
    globalThis.fetch = originalFetch;
  };
}

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  };
}
