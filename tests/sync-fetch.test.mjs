import test from "node:test";
import assert from "node:assert/strict";
import { fetchJsonWithRetry } from "../src/services/sync-fetch.js";

test("does not retry POST after a transient response", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return { status: 503, json: async () => ({ error: "busy" }) };
  };

  try {
    const result = await fetchJsonWithRetry("/api/state", {
      method: "POST",
      body: "{}"
    });
    assert.equal(calls, 1);
    assert.equal(result.response.status, 503);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
