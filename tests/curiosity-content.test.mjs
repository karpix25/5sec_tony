import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { projects, products } from "../src/domain/entities.js";
import { createGenerationJob, createAutoGenerationBrief, createSemanticPlan } from "../src/domain/generation.js";

const bannedShells = /Почему цепляет|Миф:|Факт:|Рабочий шаг|полезный разбор|давать всякие|5 вещей/i;

test("ai curiosity plan reaches job, semantic plan and image prompt", () => {
  const project = projects.find((item) => item.id === "ppm");
  const product = products.find((item) => item.id === "crosspay");
  const hookLibrary = {
    activeVersionId: "v1",
    versions: [{ id: "v1", status: "active", hooks: [{ id: "h1", text: "N причин проверить это заранее", enabled: true }] }]
  };
  const generationBrief = {
    topic: "проверка причины отказа оплаты",
    hook: "Карта снова не проходит",
    productFact: "зарубежный сервис может отказать не из-за суммы, а из-за правил конкретной площадки",
    scrollStopperAngle: "деньги есть, но оплата все равно срывается",
    productPositiveBridge: "сначала понять причину отказа, потом выбирать маршрут оплаты",
    aiPlan: {
      headline: "Карта снова не проходит",
      subhead: "Иногда дело не в балансе",
      points: [
        "Сервис смотрит не только на сумму",
        "Правила площадки могут отличаться",
        "Повторять платеж вслепую рискованно",
        "Сначала уточните причину отказа"
      ],
      disclaimer: ""
    }
  };
  const job = createGenerationJob({ project, product, reference: project.references[0], character: project.characters[0], generationBrief, hookLibrary });
  const semanticPlan = createSemanticPlan({ project, product, brief: job });
  const visibleText = `${job.title} ${semanticPlan.headline} ${semanticPlan.subhead} ${semanticPlan.points.join(" ")}`;

  assert.ok(job.hookIntelligence?.hookType);
  assert.equal(job.productFact.fact, generationBrief.productFact);
  assert.equal(job.curiosityAngle.conflict, generationBrief.scrollStopperAngle);
  assert.equal(job.title, generationBrief.aiPlan.headline);
  assert.equal(semanticPlan.headline, generationBrief.aiPlan.headline);
  assert.ok(job.creativeQuality.curiosityScore >= 8);
  assert.match(job.prompt, /ФИНАЛЬНЫЙ ТЕКСТ ДЛЯ КАРТИНКИ/);
  assert.match(job.prompt, /Карта снова не проходит/);
  assert.match(job.prompt, /Сначала уточните причину отказа/);
  assert.doesNotMatch(visibleText, bannedShells);
});

test("curiosity module does not store niche fact libraries in code", () => {
  const source = readFileSync(new URL("../src/domain/curiosity-content.js", import.meta.url), "utf8");

  assert.doesNotMatch(source, /const\s+travelFacts|const\s+productFacts|const\s+curiosityPaymentFacts/);
  assert.doesNotMatch(source, /Япония|Италия|ОАЭ|Таиланд|Франция|позднего кофе|страны или типа карты|пептидная сыворотка лучше/);
});

test("ai generated travel fact stays the source of visible content", () => {
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
  const generationBrief = {
    topic: "локальные правила в путешествии",
    hook: "Один жест может испортить первое впечатление",
    productFact: "в некоторых странах бытовой жест может считываться иначе, чем дома",
    scrollStopperAngle: "турист уверен, что ведет себя вежливо, но местный контекст другой",
    productPositiveBridge: "заранее проверить локальные нормы перед первым днем поездки",
    aiPlan: {
      headline: "Жест выглядит вежливо не везде",
      subhead: "Местный контекст легко пропустить",
      points: [
        "Обычная привычка дома может выглядеть странно",
        "Перед поездкой проверьте локальную норму",
        "Не все советы работают в другой стране",
        "Лучше уточнить до первого дня маршрута"
      ],
      disclaimer: ""
    }
  };
  const brief = createAutoGenerationBrief({ project, product, reference: project.references[0], generationBrief });
  const plan = createSemanticPlan({ project, product, brief });
  const text = `${brief.finalContent.headline} ${brief.productFact.fact} ${plan.points.join(" ")}`;

  assert.ok(brief.creativeQuality.curiosityScore >= 8);
  assert.match(text, /Жест выглядит вежливо не везде/);
  assert.match(text, /бытовой жест может считываться иначе/);
  assert.doesNotMatch(text, /карта снова не проходит|зарубежный сервис|подписка|инвойс|обход/i);
  assert.doesNotMatch(text, bannedShells);
});
