import test from "node:test";
import assert from "node:assert/strict";
import { normalizeAiBrief } from "../src/domain/ai-brief-normalizer.js";
import { createAutoGenerationBrief } from "../src/domain/generation.js";
import { projects, products } from "../src/domain/entities.js";

test("ai brief normalizer humanizes dry queue headlines and topics", () => {
  const brief = normalizeAiBrief({
    topic: "Почему маска «съедает» объем: ошибка в распределении",
    hook: "Твоя маска крадет объем? Ошибка в нанесении",
    contentScript: {
      headline: "Твоя маска крадет объем? Ошибка в нанесении",
      subhead: "Разбираем зоны для салонного эффекта без утяжеления",
      points: ["Корни волос: здесь маска утяжеляет", "Средняя часть: сюда средство ложится лучше"]
    }
  });

  assert.equal(brief.hook, "Почему волосы теряют объем после маски");
  assert.equal(brief.topic, "Маска утяжеляет волосы, если нанести ее не туда");
  assert.equal(brief.aiPlan.headline, "Почему волосы теряют объем после маски");
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

  assert.equal(brief.finalContent.headline, "Скрип кожи — не чистота");
  assert.doesNotMatch(`${brief.topic} ${brief.hook} ${brief.finalContent.headline}`, /SOS|ошибка в распределении|крадет объем/i);
});
