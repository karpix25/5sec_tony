import test from "node:test";
import assert from "node:assert/strict";
import { projects, products } from "../src/domain/entities.js";
import { createGenerationJobBatch } from "../src/state/job-batch.js";

test("batch generation assigns different semantic slots before jobs run", () => {
  const project = {
    ...projects.find((item) => item.id === "ppm"),
    projectTheme: "Оплата зарубежных сервисов для россиян",
    niche: "финтех / трансграничные платежи"
  };
  const product = products.find((item) => item.id === "crosspay");
  const context = {
    project,
    product,
    reference: project.references[0],
    character: project.characters[0],
    audio: project.audioLibrary[0],
    freePrompt: ""
  };
  const jobs = createGenerationJobBatch({ context, existingJobs: [], count: 3 });

  assert.equal(jobs.length, 3);
  assert.equal(new Set(jobs.map((job) => job.semanticKey)).size, 3);
  assert.equal(new Set(jobs.map((job) => job.topic)).size, 3);
  assert.equal(new Set(jobs.map((job) => job.diversitySlot?.id)).size, 3);
});

test("wellness batch rotates product pains across content layers", () => {
  const project = projects.find((item) => item.id === "supplements");
  const product = products.find((item) => item.id === "magnesium");
  const context = {
    project,
    product,
    reference: project.references[0],
    character: project.characters[0],
    audio: project.audioLibrary[0],
    freePrompt: ""
  };
  const jobs = createGenerationJobBatch({ context, existingJobs: [], count: 3 });
  const subjects = jobs.map((job) => job.diversitySlot?.contentLayer?.subject);

  assert.deepEqual(subjects, ["тяжело уснуть", "нервное напряжение", "утренняя разбитость"]);
  assert.equal(new Set(subjects).size, 3);
});
