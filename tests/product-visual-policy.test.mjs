import test from "node:test";
import assert from "node:assert/strict";
import { createAutoGenerationBrief, createGenerationJob } from "../src/domain/generation.js";
import { normalizeProductInFramePercent, resolveProductVisualMode } from "../src/domain/product-visual-policy.js";

const project = { id: "project-1", name: "Проект", productInFramePercent: 30, references: [{ id: "ref-1", title: "Design" }] };
const reference = { id: "ref-1", title: "Design", imageData: "https://cdn.example.com/design.png" };
const product = {
  id: "product-1",
  projectId: "project-1",
  name: "Хлорофилл",
  description: "Зеленый напиток",
  offer: "ежедневная wellness-рутина",
  components: "хлорофилл, мята",
  pains: ["обычная вода скучная"],
  facts: ["без медицинских обещаний"],
  forbidden: ["лечит"],
  references: [{ title: "Флакон", imageData: "https://cdn.example.com/product.png" }]
};

test("product visual policy follows project percentage across generated jobs", () => {
  const jobs = [];
  for (let index = 0; index < 10; index += 1) {
    jobs.push(createGenerationJob({ project, product, reference, existingJobs: jobs }));
  }

  const exactCount = jobs.filter((job) => job.productVisualMode === "exact-product").length;
  const noPackageCount = jobs.filter((job) => job.productVisualMode === "no-package").length;

  assert.equal(exactCount, 3);
  assert.equal(noPackageCount, 7);
});

test("no-package jobs do not pass product references and forbid product visuals in prompt", () => {
  const noProductProject = { ...project, productInFramePercent: 0 };
  const job = createGenerationJob({ project: noProductProject, product, reference });

  assert.equal(job.productVisualMode, "no-package");
  assert.equal(job.inputRefs.some((item) => item.role === "product"), false);
  assert.match(job.prompt, /ЖЕСТКИЙ ЗАПРЕТ ДЛЯ ФИНАЛЬНОГО ДИЗАЙНА/);
  assert.match(job.prompt, /не показывать и не описывать физический продукт/);
  assert.match(job.prompt, /не заменять его аналогами продукта/);
  assert.match(job.prompt, /нижний правый угол держать как чистое негативное пространство/);
  assert.doesNotMatch(job.prompt, /Референсы продукта/);
  assert.doesNotMatch(job.prompt, /Хлорофилл|Флакон|хлорофилл, мята/);
});

test("project percentage is clamped and product references are required for exact product mode", () => {
  assert.equal(normalizeProductInFramePercent("-10"), 0);
  assert.equal(normalizeProductInFramePercent("140"), 100);
  assert.equal(resolveProductVisualMode({
    project: { id: "project-1", productInFramePercent: 100 },
    product: { ...product, references: [] },
    existingJobs: []
  }), "no-package");
});

test("visible subhead does not duplicate headline", () => {
  const brief = createAutoGenerationBrief({
    project,
    product,
    reference,
    generationBrief: {
      aiPlan: {
        headline: "Почему вода кажется скучной",
        subhead: "Почему вода кажется скучной",
        points: ["Сначала проверьте вкус", "Добавьте спокойный ритуал"]
      }
    }
  });

  assert.notEqual(brief.finalContent.subhead, brief.finalContent.headline);
  assert.match(brief.finalContent.subhead, /вкус|ритуал/i);
});
