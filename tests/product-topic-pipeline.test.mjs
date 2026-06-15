import test from "node:test";
import assert from "node:assert/strict";
import { projects, products } from "../src/domain/entities.js";
import { buildImagePrompt, createAutoGenerationBrief } from "../src/domain/generation.js";

test("wellness generation brief uses use cases and proof points for stronger topic seed", () => {
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
    pains: ["к вечеру нет ощущения легкости", "хаос в wellness-рутине"],
    facts: ["без магических обещаний", "важна регулярность"],
    useCases: ["человек пьет кофе утром, но к середине дня уже сдувается", "хочется один повторяемый healthy-ритуал без перегруза"],
    proofPoints: ["жидкий формат легко встроить в утренний стакан воды", "продукт логичнее подавать как часть ритуала, а не как чудо-средство"],
    visualAnchors: ["стакан воды утром", "зеленая капля", "чистый стол и понятный ритуал"],
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

test("image prompt includes use cases proof points and visual anchors", () => {
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

  assert.match(prompt, /Жизненные сценарии продукта/);
  assert.match(prompt, /вечером трудно остановиться после перегруза/);
  assert.match(prompt, /Опорные факты для текста/);
  assert.match(prompt, /вечерний формат приема/);
  assert.match(prompt, /Визуальные якоря кроме упаковки/);
  assert.match(prompt, /стакан воды на тумбочке/);
});
