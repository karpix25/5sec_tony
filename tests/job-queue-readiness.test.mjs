import test from "node:test";
import assert from "node:assert/strict";
import { checkJobQueueReadiness } from "../scripts/job-queue-readiness.mjs";

test("job queue readiness reports inline mode without requiring Redis", async () => {
  const result = await checkJobQueueReadiness({
    envPath: "/tmp/missing-anton-env",
    env: { JOB_QUEUE_MODE: "inline" },
    isPostgresConfigured: () => true,
    queryPostgres: async () => ({ rows: [{ ok: 1 }] })
  });

  assert.equal(result.ok, true);
  assert.equal(result.checks.find((item) => item.name === "redis").message, "inline mode; Redis is not required");
});
