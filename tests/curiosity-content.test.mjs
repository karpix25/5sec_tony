import test from "node:test";
import assert from "node:assert/strict";
import { projects, products } from "../src/domain/entities.js";
import { createGenerationJob, createAutoGenerationBrief, createSemanticPlan } from "../src/domain/generation.js";

const bannedShells = /Почему цепляет|Миф:|Факт:|Рабочий шаг|полезный разбор|давать всякие|5 вещей/i;

test("curiosity chain reaches job, semantic plan and image prompt", () => {
  const hookLibrary = {
    activeVersionId: "v1",
    versions: [{ id: "v1", status: "active", hooks: [{ id: "h1", text: "N причин проверить это заранее", enabled: true }] }]
  };

  for (const product of products) {
    const project = projects.find((item) => item.id === product.projectId);
    const job = createGenerationJob({ project, product, reference: project.references[0], character: project.characters[0], hookLibrary });
    const semanticPlan = createSemanticPlan({ project, product, brief: job });
    const visibleText = `${job.title} ${semanticPlan.headline} ${semanticPlan.subhead} ${semanticPlan.points.join(" ")}`;

    assert.ok(job.hookIntelligence?.hookType);
    assert.ok(job.productFact?.fact);
    assert.ok(job.curiosityAngle?.conflict);
    assert.ok(job.finalContent?.headline);
    assert.equal(job.title, job.finalContent.headline);
    assert.equal(semanticPlan.headline, job.finalContent.headline);
    assert.ok(job.creativeQuality.passed);
    assert.ok(job.creativeQuality.curiosityScore >= 8);
    assert.match(job.prompt, /ФИНАЛЬНЫЙ ТЕКСТ ДЛЯ КАРТИНКИ/);
    assert.match(job.prompt, new RegExp(job.finalContent.headline.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(visibleText, bannedShells);
  }
});

test("product facts create distinct non-generic themes", () => {
  const rows = products.map((product) => {
    const project = projects.find((item) => item.id === product.projectId);
    return createGenerationJob({ project, product, reference: project.references[0], character: project.characters[0] });
  });
  const titles = rows.map((job) => job.title);
  const facts = rows.map((job) => job.productFact.fact).join(" ");

  assert.equal(new Set(titles).size, titles.length);
  assert.match(facts, /позднего кофе|яркий экран/);
  assert.match(facts, /коллаген и витамин C|белок в рационе/);
  assert.match(facts, /пептидная сыворотка|патч-тест|активами/);
  assert.match(facts, /страны или типа карты/);
});

test("travel content keeps tourism facts when payment bot is used for tourism", () => {
  const project = {
    ...projects.find((item) => item.id === "ppm"),
    projectTheme: "Рекомендации и лайфхаки о туризме",
    companyInfo: "Рекомендации и лайфхаки о туризме"
  };
  const product = {
    ...products.find((item) => item.id === "crosspay"),
    name: "Плати по миру бот в тг",
    description: "Рекомендации для туристов в разных странах",
    offer: "Давать интересные факты и рекомендации о туризме в другие страны",
    facts: ["интересные достопримечательности", "культурные особенности", "необычные факты о странах"]
  };
  const brief = createAutoGenerationBrief({ project, product, reference: project.references[0] });
  const plan = createSemanticPlan({ project, product, brief });
  const text = `${brief.finalContent.headline} ${brief.productFact.fact} ${plan.points.join(" ")}`;

  assert.ok(brief.creativeQuality.curiosityScore >= 8);
  assert.match(text, /Япония|Италия|ОАЭ|Таиланд|Франция/);
  assert.match(text, /чаевые|капучино|публичные правила|обувь|расписание/);
  assert.doesNotMatch(text, /карта снова не проходит|зарубежный сервис|подписка|инвойс|обход/i);
  assert.doesNotMatch(text, bannedShells);
});
