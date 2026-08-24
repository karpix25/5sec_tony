import test from "node:test";
import assert from "node:assert/strict";
import { projects, products } from "../src/domain/entities.js";
import { createAutoGenerationBrief, createGenerationJob } from "../src/domain/generation.js";

test("AI generation cannot start with an oversized headline", () => {
  const project = projects[0];
  const product = products.find((item) => item.projectId === project.id);

  assert.throws(() => createGenerationJob({
    project,
    product,
    reference: project.references[0],
    generationBrief: {
      contentScript: {
        headline: "5 сигналов, что про высокая озировка хлорофилл 500мг на порции. Приятный мятный вкус. Есть мерный колпачок лучше узнать заранее",
        subhead: "",
        points: []
      }
    }
  }), /Финальный текст AI-брифа не прошел проверку/);
});

test("AI headline is not replaced with a canned formula after editorial review", () => {
  const project = projects[0];
  const product = products.find((item) => item.projectId === project.id);
  const headline = "Ошибка крадет объем волос";
  const brief = createAutoGenerationBrief({
    project,
    product,
    reference: project.references[0],
    existingJobs: [{ title: "Ошибка портит результат" }, { title: "Ошибка мешает уходу" }],
    generationBrief: { contentScript: { headline, subhead: "", points: ["Короткий пункт"] } }
  });

  assert.equal(brief.finalContent.headline, headline);
});
