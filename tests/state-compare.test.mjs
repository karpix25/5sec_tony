import test from "node:test";
import assert from "node:assert/strict";
import { getStateDifference, statesEqual } from "../scripts/state-compare.mjs";

test("state comparison ignores object key order", () => {
  assert.equal(
    statesEqual(
      { jobs: [{ id: "job-1", title: "A" }], projects: [{ id: "project-1", name: "P" }] },
      { projects: [{ name: "P", id: "project-1" }], jobs: [{ title: "A", id: "job-1" }] }
    ),
    true
  );
});

test("state comparison keeps array order significant", () => {
  assert.equal(
    statesEqual(
      { jobs: [{ id: "job-1" }, { id: "job-2" }] },
      { jobs: [{ id: "job-2" }, { id: "job-1" }] }
    ),
    false
  );
});

test("state comparison accepts relational defaults for new products", () => {
  const attemptedState = {
    projects: [{ id: "project-1", name: "Project" }],
    products: [{ id: "product-1", projectId: "project-1", name: "Product" }],
    jobs: []
  };
  const rebuiltState = {
    projects: [{ id: "project-1", name: "Project", references: [], audioLibrary: [], avatarCandidates: [], designReferenceCandidates: [], characters: [] }],
    products: [{ id: "product-1", projectId: "project-1", name: "Product", description: "", offer: "", components: "", pains: [], facts: [], forbidden: [], aiPassport: {}, references: [] }],
    jobs: [],
    audioLibrary: [],
    hookLibrary: { activeVersionId: "", versions: [] },
    reelsResearch: null,
    selectedProjectId: "",
    selectedProductId: "",
    selectedReferenceId: "",
    selectedCharacterId: "",
    selectedAudioId: "",
    selectedProjectTab: "project",
    generationBrief: {},
    freePrompt: ""
  };

  assert.equal(statesEqual(rebuiltState, attemptedState), true);
});

test("state comparison still detects product loss", () => {
  const attemptedState = {
    projects: [{ id: "project-1" }],
    products: [{ id: "product-1", projectId: "project-1", name: "Product" }],
    jobs: []
  };
  const rebuiltState = {
    projects: [{ id: "project-1" }],
    products: [],
    jobs: []
  };

  assert.equal(statesEqual(rebuiltState, attemptedState), false);
  assert.deepEqual(getStateDifference(rebuiltState, attemptedState), {
    path: "$.products.length",
    left: 0,
    right: 1
  });
});

test("state comparison accepts postgres dates for queue timestamps", () => {
  const queueScheduledAt = "2026-06-29T20:20:00.000Z";
  const attemptedState = {
    projects: [{ id: "project-1" }],
    products: [{ id: "product-1", projectId: "project-1", name: "Product" }],
    jobs: [{ id: "job-1", projectId: "project-1", productId: "product-1", queueScheduledAt }]
  };
  const rebuiltState = {
    projects: [{ id: "project-1" }],
    products: [{ id: "product-1", projectId: "project-1", name: "Product" }],
    jobs: [{ id: "job-1", projectId: "project-1", productId: "product-1", queueScheduledAt: new Date(queueScheduledAt) }]
  };

  assert.equal(statesEqual(rebuiltState, attemptedState), true);
  assert.equal(getStateDifference(rebuiltState, attemptedState), null);
});
