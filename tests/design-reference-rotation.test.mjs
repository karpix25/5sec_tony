import test from "node:test";
import assert from "node:assert/strict";
import { projects, products } from "../src/domain/entities.js";
import { getActiveDesignReferences, pickNextDesignReference } from "../src/domain/references.js";
import { createReferenceEntity } from "../src/state/factories.js";
import { createGenerationJobBatch } from "../src/state/job-batch.js";

test("design references are active by default", () => {
  const reference = createReferenceEntity({ id: "ref-a", title: "A" });

  assert.equal(reference.isActive, true);
  assert.deepEqual(getActiveDesignReferences({ references: [reference] }).map((item) => item.id), ["ref-a"]);
});

test("inactive design references are skipped when active ones exist", () => {
  const project = {
    references: [
      { id: "ref-a", type: "design", title: "A", isActive: false },
      { id: "ref-b", type: "design", title: "B", isActive: true }
    ]
  };

  assert.deepEqual(getActiveDesignReferences(project).map((item) => item.id), ["ref-b"]);
});

test("batch generation rotates active design references", () => {
  const baseProject = projects.find((item) => item.id === "supplements");
  const project = {
    ...baseProject,
    references: [
      { id: "ref-a", type: "design", title: "A" },
      { id: "ref-b", type: "design", title: "B" },
      { id: "ref-c", type: "design", title: "C" }
    ]
  };
  const context = {
    project,
    product: products.find((item) => item.projectId === project.id),
    reference: project.references[0],
    character: project.characters[0],
    audio: project.audioLibrary[0],
    freePrompt: ""
  };

  const jobs = createGenerationJobBatch({ context, existingJobs: [], count: 4 });

  assert.deepEqual(jobs.map((job) => job.referenceId), ["ref-a", "ref-b", "ref-c", "ref-a"]);
  assert.deepEqual(jobs.map((job) => job.referenceTitle), ["A", "B", "C", "A"]);
});

test("next design reference counts older jobs by title when id is missing", () => {
  const project = {
    references: [
      { id: "ref-a", type: "design", title: "A" },
      { id: "ref-b", type: "design", title: "B" }
    ]
  };

  const reference = pickNextDesignReference({
    project,
    fallbackReference: project.references[0],
    existingJobs: [{ referenceTitle: "A" }]
  });

  assert.equal(reference.id, "ref-b");
});
