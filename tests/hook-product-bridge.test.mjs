import test from "node:test";
import assert from "node:assert/strict";
import { projects, products } from "../src/domain/entities.js";
import { createAutoGenerationBrief, createSemanticPlan } from "../src/domain/generation.js";

test("hook library combines hook shape with product context instead of product-name insertion", () => {
  const project = {
    ...projects.find((item) => item.id === "ppm"),
    projectTheme: "Рекомендации и лайфхаки о туризме",
    companyInfo: "Рекомендации и лайфхаки о туризме"
  };
  const product = {
    ...products.find((item) => item.id === "crosspay"),
    name: "Плати по миру бот в тг",
    description: "Рекомендации для туристов в разных странах",
    offer: "Интересные факты, маршруты, локальные правила и рекомендации о туризме",
    pains: ["не знать локальные правила страны"],
    facts: ["интересные достопримечательности", "культурные особенности"]
  };
  const hookReference = { text: "7 красных флагов [темы]", tags: ["красный флаг"] };
  const brief = createAutoGenerationBrief({
    project,
    product,
    reference: project.references[0],
    generationBrief: { hookReference },
    existingJobs: []
  });
  const plan = createSemanticPlan({ project, product, brief });
  const text = `${brief.topic} ${brief.hook} ${plan.points.join(" ")}`.toLowerCase();

  assert.match(brief.notes, /Hook Product Bridge/);
  assert.match(brief.hook, /красн|флаг|локальные правила/i);
  assert.match(text, /локальные правила|достопримечательности|культурные особенности/);
  assert.doesNotMatch(text, /по теме достопримечательностях|если о /);
  assert.doesNotMatch(`${brief.topic} ${brief.hook}`.toLowerCase(), /плати по миру|бот в тг|переплатить за/);
});
