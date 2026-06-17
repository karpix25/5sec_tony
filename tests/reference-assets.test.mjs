import test from "node:test";
import assert from "node:assert/strict";
import { projects, products } from "../src/domain/entities.js";
import { createGenerationJob } from "../src/domain/generation.js";
import { resolveImageInputUrls, summarizeInputRefs } from "../scripts/reference-assets.mjs";

const tinyPng = "data:image/png;base64,iVBORw0KGgo=";

test("generation job keeps local product references for image-to-image handoff", () => {
  const project = projects[0];
  const product = {
    ...products[0],
    references: [{
      title: "Реальная упаковка",
      promptComment: "белая бутылка с зеленой этикеткой",
      imageData: tinyPng
    }]
  };
  const job = createGenerationJob({
    project,
    product,
    reference: project.references[0],
    character: project.characters[0],
    generationBrief: {
      topic: "Как выбрать хлорофилл",
      hook: "Что смотреть на упаковке",
      visualObject: "реальная бутылка крупно"
    }
  });

  assert.deepEqual(job.inputUrls, [tinyPng]);
  assert.deepEqual(job.inputRefs, [{ role: "product", title: "Реальная упаковка", isLocalData: true }]);
  assert.match(job.prompt, /Референсы продукта: Реальная упаковка: белая бутылка с зеленой этикеткой/);
  assert.match(job.prompt, /РЕЖИМ ПРОДУКТА: exact-product/);
  assert.doesNotMatch(job.prompt, /он не передан в image-to-image/);
});

test("reference asset resolver publishes data urls through public base url", async () => {
  const previousPublicBase = process.env.PUBLIC_BASE_URL;
  process.env.PUBLIC_BASE_URL = "https://studio.example.com";
  const resolved = await resolveImageInputUrls([tinyPng, "https://cdn.example.com/style.png"], {
    headers: { host: "127.0.0.1:4173" }
  });
  if (previousPublicBase === undefined) delete process.env.PUBLIC_BASE_URL;
  else process.env.PUBLIC_BASE_URL = previousPublicBase;

  assert.equal(resolved.length, 2);
  assert.match(resolved[0], /^https:\/\/studio\.example\.com\/api\/reference-assets\//);
  assert.equal(resolved[1], "https://cdn.example.com/style.png");
});

test("reference asset logs distinguish product references", () => {
  const summary = summarizeInputRefs({
    rawInputUrls: [tinyPng, "https://cdn.example.com/style.png"],
    resolvedInputUrls: ["https://studio.example.com/api/reference-assets/1", "https://cdn.example.com/style.png"],
    inputRefs: [
      { role: "product", title: "Реальная упаковка", isLocalData: true },
      { role: "design", title: "Стиль", isLocalData: false }
    ]
  });

  assert.deepEqual(summary, {
    rawInputUrls: 2,
    resolvedInputUrls: 2,
    localInputUrls: 1,
    remoteInputUrls: 1,
    productRefs: 1,
    localProductRefs: 1,
    designRefs: 1
  });
});

test("generation job skips product image inputs in no-package mode", () => {
  const project = projects[0];
  const product = {
    ...products[0],
    references: [{
      title: "Реальная упаковка",
      promptComment: "белая бутылка с зеленой этикеткой",
      imageData: tinyPng
    }]
  };
  const job = createGenerationJob({
    project,
    product,
    reference: project.references[0],
    character: project.characters[0],
    generationBrief: {
      topic: "Почему тяжело уснуть",
      hook: "Что мешает расслабиться вечером",
      visualObject: "вечерний свет и стакан воды"
    }
  });

  assert.equal(job.productVisualMode, "no-package");
  assert.deepEqual(job.inputRefs, []);
  assert.deepEqual(job.inputUrls, []);
  assert.match(job.prompt, /Не показывать упаковку продукта вообще/);
});
