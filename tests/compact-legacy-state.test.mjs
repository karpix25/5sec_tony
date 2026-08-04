import test from "node:test";
import assert from "node:assert/strict";
import { compactLegacyState, estimateJsonBytes } from "../scripts/compact-legacy-state.mjs";

test("compact legacy state keeps settings and removes heavy project/product fields", () => {
  const state = {
    selectedProjectId: "project-1",
    selectedProjectTab: "automation",
    settings: { theme: "light", imageProvider: "kie" },
    audioLibrary: [{ id: "audio-1", fileData: "https://cdn.example.com/audio.mp3" }],
    projects: [{
      id: "project-1",
      name: "Project",
      automation: { enabled: true, dailyLimit: 3 },
      characters: [{ id: "character-1", name: "Host", prompt: "x".repeat(100_000), imageData: "data:image/png;base64,AAA" }],
      references: [{ id: "reference-1", title: "Reference", imageUrl: "https://cdn.example/ref.png" }]
    }],
    products: [{
      id: "product-1",
      projectId: "project-1",
      name: "Product",
      offer: "Offer",
      aiPassport: { summary: "Useful setting", imagePrompt: "x".repeat(10_000) }
    }],
    jobs: [{ id: "job-1", status: "queued", stage: "brief", progress: 10, prompt: "x".repeat(100_000), imageData: "data:image/png;base64,BBB" }]
  };

  const compacted = compactLegacyState(state);

  assert.equal(compacted.selectedProjectId, "project-1");
  assert.deepEqual(compacted.settings, { theme: "light", imageProvider: "kie" });
  assert.equal(compacted.projects[0].automation.enabled, true);
  assert.equal(compacted.projects[0].characters[0].name, "Host");
  assert.equal("prompt" in compacted.projects[0].characters[0], false);
  assert.equal("imageData" in compacted.projects[0].characters[0], false);
  assert.equal("imageUrl" in compacted.projects[0].references[0], false);
  assert.equal(compacted.audioLibrary[0].fileData, "https://cdn.example.com/audio.mp3");
  assert.equal(compacted.products[0].aiPassport.summary, "Useful setting");
  assert.equal("imagePrompt" in compacted.products[0].aiPassport, false);
  assert.equal("prompt" in compacted.jobs[0], false);
  assert.equal("imageData" in compacted.jobs[0], false);
});

test("compact legacy state keeps only minimal job status fields and does not mutate input", () => {
  const state = {
    projects: [],
    products: [],
    jobs: [{
      id: "job-1",
      projectId: "project-1",
      status: "failed",
      stage: "brief",
      progress: 3,
      title: "A".repeat(3_000),
      queueStatus: "retrying",
      extra: { prompt: "must drop" },
      unexpected: "must drop"
    }]
  };
  const before = structuredClone(state);
  const compacted = compactLegacyState(state, { maxTextLength: 100 });

  assert.deepEqual(state, before);
  assert.equal(compacted.jobs.length, 1);
  assert.equal(compacted.jobs[0].status, "failed");
  assert.equal(compacted.jobs[0].queueStatus, "retrying");
  assert.equal(compacted.jobs[0].title.length, 103);
  assert.equal("extra" in compacted.jobs[0], false);
  assert.equal("unexpected" in compacted.jobs[0], false);
});

test("compact legacy state handles empty and non-object inputs", () => {
  assert.deepEqual(compactLegacyState({}), { projects: [], products: [], jobs: [] });
  assert.equal(compactLegacyState(null), null);
  assert.equal(compactLegacyState(undefined), undefined);
  assert.throws(() => compactLegacyState([]), /plain object/);
});

test("compact legacy state rejects circular input and materially reduces size", () => {
  const state = { projects: [], products: [], jobs: [], prompt: "x".repeat(500_000) };
  state.self = state;
  assert.throws(() => compactLegacyState(state), /circular/);

  const heavy = { projects: [{ id: "p", imageData: "data:image/png;base64," + "A".repeat(200_000) }], products: [], jobs: [] };
  const compacted = compactLegacyState(heavy);
  assert.ok(estimateJsonBytes(compacted) < estimateJsonBytes(heavy) / 100);
  assert.ok(estimateJsonBytes(compacted) < 10_000);
  assert.equal(estimateJsonBytes(undefined), 0);

  const cyclicArray = [];
  cyclicArray.push(cyclicArray);
  assert.throws(() => compactLegacyState({ projects: cyclicArray }), /circular/);
});
