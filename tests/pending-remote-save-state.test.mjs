import test from "node:test";
import assert from "node:assert/strict";
import { compactStateForPendingRemoteSave, prepareStateForRemoteSave } from "../src/state/pending-remote-save-state.js";

test("remote save keeps only pending reservations when jobs did not change", () => {
  const prepared = prepareStateForRemoteSave({
    projects: [{ id: "project-1" }],
    jobs: [
      { id: "old-job", status: "done" },
      { id: "pending-job", serverOwned: true, isBriefPlaceholder: true, serverReservationStatus: "requested" }
    ]
  });

  assert.equal(prepared.preserveJobs, true);
  assert.deepEqual(prepared.state.jobs.map((job) => job.id), ["pending-job"]);
  assert.equal(prepared.state.jobs[0].isBriefPlaceholder, true);
  assert.equal(prepared.state.jobs[0].serverReservationStatus, "requested");
});

test("remote save keeps a compact job list when jobs changed", () => {
  const prepared = prepareStateForRemoteSave({
    jobs: [{ id: "job-1", prompt: "legacy job prompt" }]
  }, ["jobs"]);

  assert.equal(prepared.preserveJobs, false);
  assert.equal(prepared.state.jobs[0].prompt, undefined);
  assert.equal(prepared.state.jobs[0].id, "job-1");
});

test("pending remote save drops heavy generated job payloads", () => {
  const state = {
    jobs: [{
      id: "job-1",
      status: "running",
      stage: "image",
      title: "Тема",
      prompt: "x".repeat(10000),
      promptContract: { large: true },
      imagePromptContract: { large: true },
      aiTrace: { raw: "x".repeat(10000) },
      finalVideoUrl: "/generated/final.mp4",
      diskUrl: "https://disk.yandex.ru/i/final"
    }]
  };

  const compacted = compactStateForPendingRemoteSave(state);

  assert.equal(compacted.jobs[0].id, "job-1");
  assert.equal(compacted.jobs[0].finalVideoUrl, "/generated/final.mp4");
  assert.equal(compacted.jobs[0].diskUrl, "https://disk.yandex.ru/i/final");
  assert.equal("prompt" in compacted.jobs[0], false);
  assert.equal("promptContract" in compacted.jobs[0], false);
  assert.equal("imagePromptContract" in compacted.jobs[0], false);
  assert.equal("aiTrace" in compacted.jobs[0], false);
});
