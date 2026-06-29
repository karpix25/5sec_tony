import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSmokeOptions } from "../scripts/job-queue-smoke-test.mjs";

test("job queue smoke options normalize production defaults", () => {
  const options = normalizeSmokeOptions({
    baseUrl: "https://studio.example.com/",
    file: "payloads.json",
    count: "5",
    concurrency: "2",
    timeoutMs: "1000"
  });

  assert.equal(options.baseUrl, "https://studio.example.com");
  assert.equal(options.file, "payloads.json");
  assert.equal(options.count, 5);
  assert.equal(options.concurrency, 2);
  assert.equal(options.timeoutMs, 1000);
});
