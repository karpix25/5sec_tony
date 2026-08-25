import test from "node:test";
import assert from "node:assert/strict";
import { runCreativeTeamBrief } from "../scripts/creative-team-prompts.mjs";

test("creative team regenerates an invalid topic map with concrete feedback", async () => {
  const responses = [
    { attentionMap: { topicMap: [
      { id: "swelling", theme: "Утренние отёки", situation: "Лицо выглядит припухшим", productRelation: "Добавка помогает убрать отёки" },
      { id: "digest", theme: "Тяжесть после еды", situation: "После ужина нет комфорта", productRelation: "Напиток помогает пищеварению" },
      { id: "detox", theme: "Детокс на каждый день", situation: "Хочется очистить организм", productRelation: "Хлорофилл выводит токсины" },
      { id: "skin", theme: "Сияние кожи", situation: "Кожа выглядит тусклой", productRelation: "Напиток улучшает кожу" }
    ] } },
    { attentionMap: { topicMap: [
      { id: "taste", theme: "Когда вода надоела", situation: "Обычная вода быстро наскучивает", productRelation: "Хлорофилл можно добавлять в воду как часть ежедневного ритуала", audienceSegment: "человек с хаотичной рутиной", awarenessStage: "recognition", contentGoal: "save", evidenceIds: ["water-ritual"] },
      { id: "pause", theme: "Пауза между делами", situation: "День идёт без коротких остановок", productRelation: "Напиток можно вписать в спокойный дневной ритуал", audienceSegment: "человек с хаотичной рутиной", awarenessStage: "recognition", contentGoal: "save", evidenceIds: ["water-ritual"] },
      { id: "morning", theme: "Утро без суеты", situation: "Утренние привычки постоянно срываются", productRelation: "Хлорофилл подходит для привычного утреннего напитка", audienceSegment: "человек с хаотичной рутиной", awarenessStage: "recognition", contentGoal: "save", evidenceIds: ["water-ritual"] },
      { id: "bottle", theme: "Напиток рядом", situation: "Про стакан воды вспоминают слишком поздно", productRelation: "Хлорофилл добавляют в воду, когда хочется разнообразить ритуал", audienceSegment: "человек с хаотичной рутиной", awarenessStage: "recognition", contentGoal: "save", evidenceIds: ["water-ritual"] }
    ] } },
    { creativeBrief: { topic: "Когда вода надоела", coreIdea: "Простой ритуал", hookPromise: "Новый взгляд на воду", viewerTakeaway: "Привычку проще поддерживать", productBridge: "Добавить хлорофилл в воду", formatIntent: "saveable_note" } },
    { contentScript: { headline: "Когда вода надоела", subhead: "Ритуал проще не бросать", points: ["Меняйте привычный формат", "Держите воду на виду", "Добавляйте новый вкус", "Не усложняйте ритуал"] } },
    { formatCompliance: { formatMatched: true, issues: [], fixedContentScript: {}, finalRules: [] } },
    { visualBrief: { mainVisualObject: "стакан воды", productUsage: "small_signal" } },
    { safetyReview: { generationAllowed: true, issues: [], fixedContentScript: { headline: "", subhead: "", points: [] }, fixedVisualBrief: {}, finalWarnings: [] } }
  ];
  const calls = [];

  const draft = await runCreativeTeamBrief({
    token: "token",
    model: "test-model",
    callOpenRouter: async (_token, _model, messages) => {
      const instruction = JSON.parse(messages[1].content);
      calls.push(instruction);
      return JSON.stringify(responses.shift());
    },
    parseJsonDraft: JSON.parse,
    deferImagePromptPackage: true,
    body: {
      project: { name: "БАДы", niche: "БАДы", restrictions: "Без медицинских обещаний" },
      product: {
        name: "Жидкий хлорофилл",
        description: "Напиток с хлорофиллом для ежедневного ритуала",
        facts: ["Добавляют в воду"],
        aiPassport: { version: "product-passport-v3", productName: "Жидкий хлорофилл", category: "БАД", plainDescription: "Напиток для ежедневного ритуала" }
      },
      designAnalysis: { formatType: "checklist_cards", structureName: "Карточки" },
      existingJobs: []
    }
  });

  const mapCalls = calls.filter((instruction) => instruction.task === "Создай свежую карту смежных тем для одного продукта.");
  assert.equal(mapCalls.length, 2);
  assert.match(mapCalls[1].rules.join(" "), /Предыдущая карта отклонена/);
  assert.match(mapCalls[1].previousTopicMapFeedback.join(" "), /Утренние отёки/);
  assert.equal(draft.topicSelection.fallback, undefined);
  assert.match(draft.topicSelection.theme, /Когда вода надоела|Пауза между делами|Утро без суеты|Напиток рядом/);
  assert.equal(draft.topicSelection.awarenessStage, "recognition");
  assert.equal(draft.topicSelection.contentGoal, "save");
  assert.deepEqual(draft.topicSelection.evidenceIds, ["water-ritual"]);
  const creativePrompt = calls.find((instruction) => instruction.task === "Преврати выбранную тему в креативную идею для одного вертикального поста 9:16.");
  assert.equal(creativePrompt.topicSelection.audienceSegment, "человек с хаотичной рутиной");
  assert.match(creativePrompt.rules.join(" "), /audienceSegment, awarenessStage, contentGoal и evidenceIds/);
});

test("creative team uses the direct product fallback after three rejected maps", async () => {
  const rejectedMap = { attentionMap: { topicMap: [
    { id: "swelling", theme: "Утренние отёки", situation: "Лицо выглядит припухшим", productRelation: "Добавка помогает убрать отёки" }
  ] } };
  const responses = [
    rejectedMap,
    rejectedMap,
    rejectedMap,
    { creativeBrief: { topic: "Жидкий хлорофилл", productBridge: "Напиток для ежедневного ритуала", formatIntent: "saveable_note" } },
    { contentScript: { headline: "Ритуал с хлорофиллом", subhead: "Спокойный формат дня", points: ["Начинайте с привычного стакана воды"] } },
    { formatCompliance: { formatMatched: true, issues: [], fixedContentScript: {}, finalRules: [] } },
    { visualBrief: { mainVisualObject: "стакан воды", productUsage: "small_signal" } },
    { safetyReview: { generationAllowed: true, issues: [], fixedContentScript: { headline: "", subhead: "", points: [] }, fixedVisualBrief: {}, finalWarnings: [] } }
  ];
  const calls = [];

  const draft = await runCreativeTeamBrief({
    token: "token",
    model: "test-model",
    callOpenRouter: async (_token, _model, messages) => {
      calls.push(JSON.parse(messages[1].content));
      return JSON.stringify(responses.shift());
    },
    parseJsonDraft: JSON.parse,
    deferImagePromptPackage: true,
    body: {
      project: { name: "БАДы", niche: "БАДы" },
      product: { name: "Жидкий хлорофилл", description: "Напиток с хлорофиллом для ежедневного ритуала", aiPassport: { version: "product-passport-v3", productName: "Жидкий хлорофилл", category: "БАД" } },
      designAnalysis: { formatType: "checklist_cards", structureName: "Карточки" },
      existingJobs: []
    }
  });

  assert.equal(calls.filter((instruction) => instruction.task === "Создай свежую карту смежных тем для одного продукта.").length, 3);
  assert.equal(draft.topicSelection.fallback, true);
  assert.equal(draft.topicSelection.theme, "Жидкий хлорофилл");
});
