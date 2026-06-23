import test from "node:test";
import assert from "node:assert/strict";
import { createUniqueJobId, normalizeStateJobIds } from "../src/domain/job-identity.js";

test("job ids stay unique across large batches", () => {
  const jobs = [];
  for (let index = 0; index < 1500; index += 1) {
    jobs.push({ id: createUniqueJobId(jobs) });
  }

  assert.equal(new Set(jobs.map((job) => job.id)).size, jobs.length);
});

test("state normalization keeps the first visible job when duplicate ids already exist", () => {
  const state = {
    selectedProjectId: "project",
    jobs: [
      { id: "job-1", title: "visible current" },
      { id: "job-2", title: "other" },
      { id: "job-1", title: "stale duplicate" }
    ]
  };

  const normalized = normalizeStateJobIds(state);

  assert.deepEqual(normalized.jobs.map((job) => job.title), ["visible current", "other"]);
});

test("state normalization fills legacy job persistence defaults", () => {
  const normalized = normalizeStateJobIds({
    jobs: [{ id: "job-1", projectId: "project-1", productId: "product-1" }]
  });

  assert.deepEqual(normalized.jobs[0].inputRefs, []);
  assert.deepEqual(normalized.jobs[0].inputUrls, []);
  assert.equal(normalized.jobs[0].diversitySlot, null);
  assert.equal(normalized.jobs[0].finalVideoHasAudio, false);
  assert.equal(normalized.jobs[0].outputType, "");
});
