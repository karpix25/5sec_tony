import test from "node:test";
import assert from "node:assert/strict";
import { projects, products } from "../src/domain/entities.js";
import { createAutoGenerationBrief, createGenerationJob } from "../src/domain/generation.js";
import { getVisibleTextContractViolations } from "../src/domain/design-text-contract.js";

test("AI generation repairs an oversized headline instead of stopping", () => {
  const project = projects[0];
  const product = products.find((item) => item.projectId === project.id);

  const job = createGenerationJob({
    project,
    product,
    reference: project.references[0],
    generationBrief: {
      creativeQuality: { curiosityScore: 8, warnings: [] },
      contentScript: {
        headline: "5 сигналов, что про высокая озировка хлорофилл 500мг на порции. Мята меняет привычный вкус. Есть мерный колпачок лучше узнать заранее",
        subhead: "",
        points: []
      },
      topicCluster: { id: "daily-routine", label: "ежедневная привычка" }
    }
  });

  assert.equal(job.title, "Мята меняет привычный вкус");
  assert.equal(job.topicCluster.id, "daily-routine");
  assert.deepEqual(getVisibleTextContractViolations({ contentScript: job.finalContent }), []);
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
