import test from "node:test";
import assert from "node:assert/strict";
import { isQueueManagedServerJob, mergeClientJobWithServerJob } from "../scripts/job-state-merge-policy.mjs";

test("merge policy protects queued server job from stale client snapshot", () => {
  const merged = mergeClientJobWithServerJob(
    { id: "job-1", status: "running", stage: "brief", progress: 6, title: "UI title" },
    {
      id: "job-1",
      status: "queued",
      stage: "image",
      progress: 18,
      queueName: "generation",
      queueStatus: "queued",
      queueIdempotencyKey: "generation:job-1",
      serverJobAcceptedAt: "2026-07-21T06:11:45.000Z"
    }
  );

  assert.equal(merged.title, "UI title");
  assert.equal(merged.status, "queued");
  assert.equal(merged.stage, "image");
  assert.equal(merged.progress, 18);
  assert.equal(merged.queueStatus, "queued");
  assert.equal(merged.queueIdempotencyKey, "generation:job-1");
  assert.equal(merged.serverJobAcceptedAt, "2026-07-21T06:11:45.000Z");
});

test("merge policy preserves image task and context needed to resume server jobs", () => {
  const merged = mergeClientJobWithServerJob(
    { id: "job-2", status: "running", stage: "brief", progress: 6 },
    {
      id: "job-2",
      status: "running",
      stage: "image",
      progress: 48,
      imageTaskId: "image-task-2",
      imageProvider: "gpt-image-2",
      failMsg: "Сервер ожидает картинку...",
      serverJobContext: { project: { id: "project-1" } }
    }
  );

  assert.equal(merged.stage, "image");
  assert.equal(merged.progress, 48);
  assert.equal(merged.imageTaskId, "image-task-2");
  assert.equal(merged.imageProvider, "gpt-image-2");
  assert.deepEqual(merged.serverJobContext, { project: { id: "project-1" } });
});

test("merge policy preserves prepared generation reference content from stale client snapshots", () => {
  const merged = mergeClientJobWithServerJob(
    {
      id: "job-reference",
      status: "running",
      stage: "brief",
      progress: 6,
      referenceId: "",
      referenceTitle: "",
      inputUrls: [],
      inputRefs: []
    },
    {
      id: "job-reference",
      status: "running",
      stage: "image",
      progress: 48,
      queueName: "generation",
      queueStatus: "running",
      referenceId: "ref-funnel",
      referenceTitle: "Воронка",
      prompt: "prompt with funnel layout",
      inputUrls: ["https://example.com/funnel.png"],
      inputRefs: [{ role: "design", title: "Воронка" }]
    }
  );

  assert.equal(merged.referenceId, "ref-funnel");
  assert.equal(merged.referenceTitle, "Воронка");
  assert.equal(merged.prompt, "prompt with funnel layout");
  assert.deepEqual(merged.inputUrls, ["https://example.com/funnel.png"]);
  assert.deepEqual(merged.inputRefs, [{ role: "design", title: "Воронка" }]);
});

test("merge policy does not freeze ordinary draft job edits", () => {
  const merged = mergeClientJobWithServerJob(
    { id: "job-3", status: "queued", stage: "brief", progress: 8, title: "new" },
    { id: "job-3", status: "queued", stage: "idea", progress: 0, title: "old", queueName: "generation" }
  );

  assert.equal(merged.title, "new");
  assert.equal(merged.stage, "brief");
  assert.equal(merged.progress, 8);
});

test("queue-managed detection covers generation jobs with missing queueStatus", () => {
  assert.equal(isQueueManagedServerJob({
    id: "job-4",
    queueName: "generation",
    queueStatus: "",
    status: "running",
    stage: "brief"
  }), true);
});

test("queue-managed detection ignores default generation queue name on ordinary queued drafts", () => {
  assert.equal(isQueueManagedServerJob({
    id: "job-5",
    queueName: "generation",
    queueStatus: "",
    status: "queued",
    stage: "idea"
  }), false);
});

test("queue-managed detection covers accepted backend jobs with stripped queue fields", () => {
  assert.equal(isQueueManagedServerJob({
    id: "job-6",
    queueStatus: "",
    status: "running",
    stage: "image",
    serverJobAcceptedAt: "2026-07-21T06:11:45.000Z"
  }), true);
});

test("merge policy lets server-cleared protected fields override stale client values", () => {
  const merged = mergeClientJobWithServerJob(
    {
      id: "job-7",
      queueLockOwner: "old-worker",
      queueLockedAt: "2026-07-21T06:00:00.000Z",
      queueLastError: "old error",
      finalVideoHasAudio: true
    },
    {
      id: "job-7",
      status: "running",
      stage: "image",
      progress: 24,
      queueName: "generation",
      queueStatus: "running",
      queueLockOwner: "",
      queueLockedAt: null,
      queueLastError: "",
      finalVideoHasAudio: false
    }
  );

  assert.equal(merged.queueLockOwner, "");
  assert.equal(merged.queueLockedAt, null);
  assert.equal(merged.queueLastError, "");
  assert.equal(merged.finalVideoHasAudio, false);
});
