import test from "node:test";
import assert from "node:assert/strict";
import { projects, products } from "../src/domain/entities.js";
import { buildImagePrompt, createAutoGenerationBrief } from "../src/domain/generation.js";

test("wellness generation brief uses product pains and facts for topic seed", () => {
  const project = {
    ...projects[0],
    projectTheme: "понятные wellness-ритуалы без магии",
    audiencePains: "к вечеру нет ощущения свежести\nутром ритуал быстро разваливается"
  };
  const product = {
    id: "chlorophyll",
    projectId: project.id,
    name: "Хлорофилл",
    description: "wellness-продукт для аккуратной ежедневной рутины",
    offer: "мягкий продукт для понятного утреннего ритуала",
    components: "жидкий формат, зеленый концентрат",
    pains: ["человек пьет кофе утром, но к середине дня уже сдувается", "хаос в wellness-рутине"],
    facts: ["без магических обещаний", "важна регулярность"],
    forbidden: ["лечит", "гарантирует результат"]
  };

  const brief = createAutoGenerationBrief({
    project,
    product,
    reference: project.references[0],
    generationBrief: {}
  });

  assert.match(brief.topic, /ритуал|покупк|шум|причин|мелоч/i);
  assert.match(brief.hook, /не покуп|обсуждают|тратить|не замечать|шум|не того/i);
  assert.ok(brief.topicCandidate);
});

test("image prompt keeps product facts but does not expose deprecated product topic fields", () => {
  const project = projects[0];
  const product = {
    ...products.find((item) => item.id === "magnesium"),
    useCases: ["вечером трудно остановиться после перегруза"],
    proofPoints: ["вечерний формат приема"],
    visualAnchors: ["стакан воды на тумбочке", "спокойный свет"]
  };
  const prompt = buildImagePrompt({
    project,
    product,
    reference: project.references[0],
    character: project.characters[0]
  });

  assert.match(prompt, /Факты, которые можно использовать/);
  assert.doesNotMatch(prompt, /Жизненные сценарии продукта/);
  assert.doesNotMatch(prompt, /Опорные факты для текста/);
  assert.doesNotMatch(prompt, /Визуальные якоря кроме упаковки/);
});
