import test from "node:test";
import assert from "node:assert/strict";
import {
  assertBullMqConfig,
  getBullMqConfigError,
  getRedisConnection,
  shouldUseBullMq,
  toBullMqJobId
} from "../scripts/job-queue-dispatcher.mjs";

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

test("job queue dispatcher explains missing strict BullMQ config", () => {
  assert.equal(getBullMqConfigError({ JOB_QUEUE_MODE: "inline" }), "JOB_QUEUE_MODE должен быть bullmq");
  assert.equal(getBullMqConfigError({ JOB_QUEUE_MODE: "bullmq" }), "REDIS_HOST или REDIS_URL не настроен");
  assert.equal(
    getBullMqConfigError({ JOB_QUEUE_MODE: "bullmq", REDIS_HOST: "redis" }, { requireStrict: true }),
    "JOB_QUEUE_STRICT должен быть true"
  );
  assert.equal(getBullMqConfigError({
    JOB_QUEUE_MODE: "bullmq",
    REDIS_HOST: "redis",
    JOB_QUEUE_STRICT: "true"
  }, { requireStrict: true }), "");

  assert.throws(() => assertBullMqConfig({ JOB_QUEUE_MODE: "inline" }), /JOB_QUEUE_MODE/);
});

test("job queue dispatcher marks strict config errors with a stable code", () => {
  try {
    assertBullMqConfig({ JOB_QUEUE_MODE: "bullmq" });
    assert.fail("expected missing Redis to throw");
  } catch (error) {
    assert.equal(error.code, "JOB_QUEUE_NOT_CONFIGURED");
  }
});

test("job queue dispatcher encodes BullMQ job ids without Redis separators", () => {
  const jobId = toBullMqJobId("generation:job-f5385771-df75-46e0-8abf-5ede8b45291d");
  assert.match(jobId, /^job-/);
  assert.equal(jobId.includes(":"), false);
});
