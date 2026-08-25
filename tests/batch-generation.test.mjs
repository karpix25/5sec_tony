import test from "node:test";
import assert from "node:assert/strict";
import { projects, products } from "../src/domain/entities.js";
import { createAutoGenerationBrief } from "../src/domain/generation.js";
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
  assert.equal(new Set(jobs.map((job) => job.compositionMode)).size, 3);
  assert.equal(new Set(jobs.map((job) => job.referenceId)).size, 3);
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
  const compositionModes = jobs.map((job) => job.compositionMode);

  assert.deepEqual(subjects, ["тяжело уснуть", "нервное напряжение", "утренняя разбитость"]);
  assert.equal(new Set(subjects).size, 3);
  assert.equal(new Set(compositionModes).size, 3);
});

test("batch reserves different topic clusters before concurrent briefs run", () => {
  const project = projects.find((item) => item.id === "supplements");
  const product = {
    ...products.find((item) => item.id === "magnesium"),
    aiPassport: {
      version: "product-passport-v2",
      productName: "Магний",
      contentTerritory: {
        productWorld: "вечерний ритуал",
        directProductTopics: ["привычки перед сном"],
        adjacentHelpfulTopics: ["вечер без телефона", "спокойное начало дня"]
      }
    }
  };
  const jobs = createGenerationJobBatch({
    context: {
      project,
      product,
      reference: project.references[0],
      character: project.characters[0],
      audio: project.audioLibrary[0],
      freePrompt: ""
    },
    existingJobs: [],
    count: 2
  });

  assert.equal(new Set(jobs.map((job) => job.topicCluster?.id)).size, 2);
  assert.deepEqual(jobs.map((job) => job.diversitySlot.topicCluster), jobs.map((job) => job.topicCluster));
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

test("repeated generic ai topics do not collapse a batch into one subject", () => {
  const project = {
    ...projects.find((item) => item.id === "ppm"),
    projectTheme: "Рекомендации и лайфхаки о туризме",
    keyScenarios: "",
    audiencePains: ""
  };
  const product = {
    ...products.find((item) => item.id === "crosspay"),
    name: "Плати по миру бот в тг",
    description: "Рекомендации для туристов в разных странах",
    offer: "Давать интересные факты и рекомендации о туризме в другие страны",
    facts: ["О достопримечательностях интересных, о культурных особенностях, необычных фактах о странах"],
    pains: []
  };
  const genericTopic = "Как отличить полезный факт от красивого обещания: О достопримечательностях интересных, о культурных особенностях, необычных фактах о странах";
  const context = {
    project,
    product,
    reference: project.references[0],
    character: null,
    audio: project.audioLibrary[0],
    freePrompt: ""
  };
  const initialJobs = createGenerationJobBatch({ context, existingJobs: [], count: 3 });
  const rebuilt = [];

  for (const job of initialJobs) {
    const brief = createAutoGenerationBrief({
      project,
      product,
      reference: project.references[0],
      existingJobs: rebuilt,
      generationBrief: {
        diversitySlot: job.diversitySlot,
        topic: genericTopic,
        hook: job.title,
        format: job.format
      }
    });
    rebuilt.push({ ...job, topic: brief.topic, title: brief.hook, diversitySlot: brief.diversitySlot });
  }

  assert.equal(new Set(rebuilt.map((job) => job.topic)).size, 3);
  assert.ok(rebuilt.every((job) => !job.topic.startsWith("Как отличить полезный факт")));
  assert.deepEqual(rebuilt.map((job) => job.diversitySlot.contentLayer.subject), [
    "интересные достопримечательности",
    "культурные особенности",
    "необычные факты о странах"
  ]);
});
