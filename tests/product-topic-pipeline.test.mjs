import test from "node:test";
import assert from "node:assert/strict";
import { projects, products } from "../src/domain/entities.js";
import { buildImagePrompt, createAutoGenerationBrief } from "../src/domain/generation.js";
import { buildTopicCandidates } from "../src/domain/topic-candidates.js";

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

  assert.match(brief.topic, /ритуал|покупк|шум|причин|мелоч|ожидан/i);
  assert.match(brief.hook, /не покуп|обсуждают|тратить|не замечать|шум|не того|ожидан|красный флаг/i);
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

test("topic candidates pass psychology strategy without canned hook text", () => {
  const project = {
    ...projects[0],
    projectTheme: "хлорофилл и wellness без магии",
    audiencePains: "усталость от блогерских обещаний\nстрах купить пустышку"
  };
  const product = {
    id: "chlorophyll",
    projectId: project.id,
    name: "Хлорофилл",
    description: "wellness-продукт для аккуратной ежедневной рутины",
    offer: "понятный утренний ритуал без громких обещаний",
    components: "жидкий формат, зеленый концентрат",
    pains: ["страх купить пустышку", "непонятно, где польза, а где маркетинг"],
    facts: ["важна регулярность", "без магических обещаний"],
    forbidden: ["лечит", "гарантирует результат"]
  };

  const [candidate] = buildTopicCandidates({ project, product, existingJobs: [] });

  assert.ok(candidate.strategyId);
  assert.ok(candidate.trigger);
  assert.ok(candidate.promptInstruction);
  assert.equal(candidate.hook, "");
  assert.match(`${candidate.topic} ${candidate.promptInstruction}`, /шум|пустышк|провер|ожидан|маркетинг|цены|пользы/i);
  assert.doesNotMatch(candidate.hook, /проверили одну ошибку/i);
  assert.equal(candidate.safetyPenalty, 0);
});

test("supplement strategy names concrete check instead of vague mistake hook", () => {
  const project = {
    ...projects[0],
    projectTheme: "коллаген как БАД без обещаний омоложения",
    audiencePains: "кожа выглядит уставшей\nстрах купить красивую банку без смысла"
  };
  const product = {
    id: "collagen-test",
    projectId: project.id,
    name: "Коллаген",
    description: "БАД для beauty-рутины",
    offer: "часть регулярной beauty-привычки",
    components: "коллаген, витамин C",
    pains: ["кожа выглядит уставшей", "страх купить пустышку"],
    facts: ["важна регулярность", "без обещаний омоложения"],
    forbidden: ["минус 10 лет", "гарантирует результат"]
  };

  const candidates = buildTopicCandidates({ project, product, existingJobs: [] });
  const strategyText = candidates.map((item) => `${item.topic} ${item.promptInstruction}`).join("\n");

  assert.ok(candidates.every((item) => item.hook === ""));
  assert.match(strategyText, /ожидан|пустышк|провер|регулярн|маркетинг/i);
  assert.doesNotMatch(strategyText, /проверили одну ошибку/i);
});
