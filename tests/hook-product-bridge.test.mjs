import test from "node:test";
import assert from "node:assert/strict";
import { projects, products } from "../src/domain/entities.js";
import { createAutoGenerationBrief, createSemanticPlan } from "../src/domain/generation.js";
import { adaptHookText } from "../src/domain/hook-adapter.js";

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
  assert.match(brief.hook, /сигнал|признак|детал|момент|локальные правила/i);
  assert.match(text, /локальные правила|достопримечательности|культурные особенности/);
  assert.doesNotMatch(text, /по теме|достопримечательностях интересных|если о |красных флагов/);
  assert.doesNotMatch(`${brief.topic} ${brief.hook}`.toLowerCase(), /плати по миру|бот в тг|переплатить за/);
});

test("hook adapter rewrites formulas as original hooks instead of literal template fill", () => {
  const hook = adaptHookText(
    { text: "7 красных флагов [темы]" },
    {
      project: { projectTheme: "Рекомендации и лайфхаки о туризме" },
      product: {
        name: "Плати по миру бот в тг",
        facts: ["О достопримечательностях интересных, о культурных особенностях"],
        offer: "Давать интересные факты и рекомендации о туризме"
      },
      angle: "О достопримечательностях интересных"
    }
  );

  assert.match(hook, /интересные достопримечательности/);
  assert.match(hook, /сигнал|признак|детал/);
  assert.doesNotMatch(hook.toLowerCase(), /красных флагов|по теме|бот в тг/);
});

test("travel product facts override stale payment history in fallback generation", () => {
  const project = {
    id: "ppm",
    name: "Плати по миру",
    projectTheme: "Рекомендации и лайфхаки о туризме",
    companyInfo: "Рекомендации и лайфхаки о туризме"
  };
  const product = {
    id: "crosspay",
    projectId: "ppm",
    name: "Плати по миру бот в тг",
    description: "Рекомендации для туристов в разных странах",
    offer: "Давать всякие интересные факты и рекомендации о туризме в другие страны",
    facts: ["О достопримечательностях интересных, о культурных особенностях, необычных фактах о странах"],
    pains: []
  };
  const existingJobs = Array.from({ length: 12 }, (_, index) => ({
    id: `old-payment-${index}`,
    projectId: "ppm",
    productId: "crosspay",
    title: "Как не переплатить за Плати по миру бот в тг",
    topic: "оплата санкционные блокировки рубли подписки"
  }));
  const brief = createAutoGenerationBrief({ project, product, reference: { layoutType: "infographic-template" }, existingJobs });
  const plan = createSemanticPlan({ project, product, brief });
  const visibleText = `${brief.topic} ${brief.hook} ${plan.points.join(" ")}`.toLowerCase();

  assert.match(visibleText, /достопримечательност|культурн|туризм|стран/);
  assert.doesNotMatch(visibleText, /переплат|санкцион|рубл|подписк|сон|воду|восстановлен|бот в тг/);
});
