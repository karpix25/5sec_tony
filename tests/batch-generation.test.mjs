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

test("batch generation distributes jobs across project products", () => {
  const project = projects.find((item) => item.id === "supplements");
  const projectProducts = products.filter((item) => item.projectId === project.id);
  const context = {
    project,
    product: projectProducts[0],
    reference: project.references[0],
    character: project.characters[0],
    audio: project.audioLibrary[0],
    freePrompt: ""
  };
  const existingJobs = [
    { projectId: project.id, productId: projectProducts[0].id },
    { projectId: project.id, productId: projectProducts[0].id }
  ];
  const jobs = createGenerationJobBatch({ context, existingJobs, products: projectProducts, count: 4 });

  assert.deepEqual(jobs.map((job) => job.productId), [
    projectProducts[1].id,
    projectProducts[1].id,
    projectProducts[0].id,
    projectProducts[1].id
  ]);
});
