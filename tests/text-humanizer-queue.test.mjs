import test from "node:test";
import assert from "node:assert/strict";
import { normalizeAiBrief } from "../src/domain/ai-brief-normalizer.js";
import { createAutoGenerationBrief } from "../src/domain/generation.js";
import { projects, products } from "../src/domain/entities.js";

test("ai brief normalizer does not replace product copy with canned headlines", () => {
  const brief = normalizeAiBrief({
    topic: "Почему маска «съедает» объем: ошибка в распределении",
    hook: "Твоя маска крадет объем? Ошибка в нанесении",
    contentScript: {
      headline: "Твоя маска крадет объем? Ошибка в нанесении",
      subhead: "Разбираем зоны для салонного эффекта без утяжеления",
      points: ["Корни волос: здесь маска утяжеляет", "Средняя часть: сюда средство ложится лучше"]
    }
  });

  assert.equal(brief.hook, "Твоя маска крадет объем? Ошибка в нанесении");
  assert.equal(brief.topic, "Почему маска съедает объем: ошибка в распределении");
  assert.equal(brief.aiPlan.headline, "Твоя маска крадет объем? Ошибка в нанесении");
});

test("generation brief keeps humanized content as queue title", () => {
  const project = projects[0];
  const product = products.find((item) => item.projectId === project.id);
  const brief = createAutoGenerationBrief({
    project,
    product,
    reference: project.references[0],
    generationBrief: {
      contentScript: {
        headline: "Почему «скрип» кожи — это сигнал SOS, а не чистота",
        subhead: "Разбор последствий агрессивного очищения",
        points: ["Миф о скрипе: кожа теряет комфорт", "Последствия для кожи: появляется сухость"]
      },
      imagePromptPackage: { prompt: "Create skincare poster" }
    }
  });

  assert.equal(brief.finalContent.headline, "Почему скрип кожи — это тревожный знак, а не чистота");
  assert.notEqual(brief.finalContent.headline, "Скрип кожи — не чистота");
});
