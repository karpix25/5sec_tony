import test from "node:test";
import assert from "node:assert/strict";
import { getRedisConnection, shouldUseBullMq } from "../scripts/job-queue-dispatcher.mjs";

test("job queue dispatcher uses BullMQ only when explicitly enabled with Redis", () => {
  assert.equal(shouldUseBullMq({ JOB_QUEUE_MODE: "inline", REDIS_URL: "redis://localhost:6379" }), false);
  assert.equal(shouldUseBullMq({ JOB_QUEUE_MODE: "bullmq" }), false);
  assert.equal(shouldUseBullMq({ JOB_QUEUE_MODE: "bullmq", REDIS_URL: "redis://localhost:6379" }), true);
  assert.equal(shouldUseBullMq({ JOB_QUEUE_MODE: "bullmq", REDIS_HOST: "redis" }), true);
});

test("job queue dispatcher builds Redis connection without leaking job data", () => {
  assert.deepEqual(getRedisConnection({ REDIS_URL: "redis://redis:6379/0" }), { url: "redis://redis:6379/0" });
  assert.deepEqual(getRedisConnection({ REDIS_HOST: "redis", REDIS_PORT: "6380", REDIS_PASSWORD: "secret" }), {
    host: "redis",
    port: 6380,
    password: "secret"
  });
});
