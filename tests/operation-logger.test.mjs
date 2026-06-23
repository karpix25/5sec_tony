import test from "node:test";
import assert from "node:assert/strict";
import { createOperationLogger, sanitizeLogValue, summarizeJobForLog } from "../scripts/operation-logger.mjs";

test("operation logger masks secrets and shortens large inline assets", () => {
  const sanitized = sanitizeLogValue({
    token: "secret-token",
    prompt: "x".repeat(220),
    imageData: "data:image/png;base64," + "a".repeat(260)
  });

  assert.equal(sanitized.token, "[redacted]");
  assert.match(sanitized.prompt, /\[chars=220\]$/);
  assert.match(sanitized.imageData, /^\[data-url:image\/png;base64/);
});

test("operation logger writes structured scope and event payload", () => {
  const lines = [];
  const logger = createOperationLogger("test-scope", {
    sink: { log: (line) => lines.push(line) },
    enabled: true
  });

  logger.log("demo", { job: summarizeJobForLog({ id: "job-1", status: "running", progress: 24 }) });

  assert.equal(lines.length, 1);
  assert.match(lines[0], /^\[test-scope:demo\] /);
  const payload = JSON.parse(lines[0].replace(/^\[test-scope:demo\] /, ""));
  assert.equal(payload.scope, "test-scope");
  assert.equal(payload.event, "demo");
  assert.equal(payload.job.id, "job-1");
  assert.equal(payload.job.progress, 24);
});
