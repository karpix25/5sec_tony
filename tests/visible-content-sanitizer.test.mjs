import test from "node:test";
import assert from "node:assert/strict";
import { projects, products } from "../src/domain/entities.js";
import { createCuriosityContentPlan } from "../src/domain/curiosity-content.js";

test("cosmetic final content removes technical labels and guaranteed claims", () => {
  const project = { ...projects[1], projectTheme: "косметика и понятный уход за кожей" };
  const product = {
    ...products.find((item) => item.id === "serum"),
    name: "СЫВОРОТКА ДЛЯ ЛИЦА - ГИАЛУРОНОВАЯ КИСЛОТА + КОЛЛАГЕН I.C.Lab",
    components: "гиалуроновая кислота, коллаген",
    pains: ["кожа выглядит усталой", "непонятно, что работает"],
    facts: ["состав и регулярность важнее громких обещаний"],
    forbidden: ["гарантированный результат", "мгновенный эффект"]
  };
  const result = createCuriosityContentPlan({
    project,
    product,
    brief: {
      hook: "5 деталей, которые меняют взгляд на непонятно",
      pointCount: "4",
      aiPlan: {
        headline: "5 деталей, которые меняют взгляд на непонятно",
        subhead: "Сначала снимите шум и покажите, что реально можно проверить без веры блогерам.",
        points: [
          "Знакомая ситуация: кожа выглядит усталой",
          "Что обычно упускают: одного общего совета мало",
          "Проверяемая деталь: гарантированно восстанавливает и настраивает естественный увлажняющий фактор кожи"
        ]
      }
    },
    layoutPlan: { layoutType: "beauty-grid" },
    hookIntelligence: {},
    existingJobs: []
  });
  const text = `${result.finalContent.headline} ${result.finalContent.subhead} ${result.finalContent.points.join(" ")}`;

  assert.doesNotMatch(text, /на непонятно|Знакомая ситуация|Что обычно упускают|Проверяемая деталь/i);
  assert.doesNotMatch(text, /гарант|восстанавливает|увлажняющий фактор/i);
  assert.match(text, /кожа выглядит усталой|состав|регулярность|ощущения/i);
});
