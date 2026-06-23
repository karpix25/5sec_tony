import test from "node:test";
import assert from "node:assert/strict";
import { buildImagePrompt, createAutoGenerationBrief } from "../src/domain/generation.js";
import { projects, products } from "../src/domain/entities.js";
import { runCreativeTeamBrief } from "../scripts/creative-team-prompts.mjs";

test("creative team image prompt package overrides legacy prompt builder", () => {
  const project = projects[0];
  const product = products.find((item) => item.projectId === project.id);
  const prompt = buildImagePrompt({
    project,
    product,
    reference: project.references[0],
    generationBrief: {
      imagePromptPackage: { prompt: "Short GPT Image 2 prompt from creative team." },
      designFormatBrief: {
        formatType: "ranking_leaderboard",
        structureName: "Топ признаков",
        layoutSlots: [{ id: "rank", role: "rank_card", textCapacity: "short" }]
      },
      contentScript: { headline: "Короткий заголовок", subhead: "Одна мысль", points: ["Первый факт", "Второй факт"] },
      visualBrief: { productUsage: "do_not_show", negativeVisuals: ["упаковка крупно"] }
    }
  });

  assert.match(prompt, /Short GPT Image 2 prompt from creative team/);
  assert.match(prompt, /Короткий заголовок/);
  assert.match(prompt, /ranking_leaderboard/);
  assert.match(prompt, /rank_card\/short/);
  assert.doesNotMatch(prompt, /СМЫСЛОВОЙ ПЛАН ДЛЯ ТЕКСТА/);
});

test("creative team leaderboard prompt locks reference structure", () => {
  const project = projects[0];
  const product = products.find((item) => item.projectId === project.id);
  const prompt = buildImagePrompt({
    project,
    product,
    reference: project.references[0],
    generationBrief: {
      imagePromptPackage: { prompt: "Use the provided design reference." },
      designFormatBrief: {
        formatType: "ranking_leaderboard",
        structureName: "Top chart",
        layoutSlots: [{ id: "rank", role: "rank_card", textCapacity: "short" }]
      },
      contentScript: { headline: "Топ признаков", subhead: "Короткая легенда", points: ["1. Первый сигнал", "2. Второй сигнал"] },
      visualBrief: { productUsage: "small_signal" }
    }
  });

  assert.match(prompt, /ОБЯЗАТЕЛЬНЫЙ FORMAT LOCK/);
  assert.match(prompt, /REFERENCE TRACE CONTRACT/);
  assert.match(prompt, /leaderboard\/top-chart skeleton/);
  assert.match(prompt, /ранговые колонки|rank cards/);
  assert.match(prompt, /темный насыщенный фон/);
  assert.match(prompt, /нельзя менять skeleton на белый лист/);
  assert.match(prompt, /Не превращать в минималистичный белый checklist/);
});

test("leaderboard prompt adapts short checklist copy into chart slots", () => {
  const project = projects[0];
  const product = products.find((item) => item.projectId === project.id);
  const prompt = buildImagePrompt({
    project,
    product,
    reference: {
      title: "Чарт",
      layoutType: "ranking_leaderboard",
      takeaways: "dark blue top chart, gold headline, cyan glowing rank cards"
    },
    generationBrief: {
      imagePromptPackage: { prompt: "Adapt the wellness checklist into the chart reference." },
      designFormatBrief: { formatType: "ranking_leaderboard", structureName: "Top chart" },
      contentScript: {
        headline: "Усталость или сигнал организма?",
        subhead: "5 маркеров, что пора пересмотреть привычки",
        points: ["Кожа стала тусклой", "Энергия падает к 16:00", "Трудно концентрироваться", "Сложно пить воду", "Тяжелый подъем"]
      }
    }
  });

  assert.match(prompt, /адаптировать видимый текст под leaderboard skeleton/);
  assert.match(prompt, /НЕ сохранять эту структуру/);
  assert.match(prompt, /TOP 10 или TOP 12 chart/);
  assert.match(prompt, /не повторять старое число вроде '5 маркеров'/);
  assert.match(prompt, /Исходных пунктов 5/);
  assert.match(prompt, /не уходить в зеленый wellness poster/);
});

test("creative team prompt keeps leaderboard lock when ai format brief is wrong", () => {
  const project = projects[0];
  const product = products.find((item) => item.projectId === project.id);
  const prompt = buildImagePrompt({
    project,
    product,
    reference: {
      title: "TOP 21 leaderboard",
      layoutType: "ranking_leaderboard",
      takeaways: "темный постер, rank cards, glowing vertical columns, value labels"
    },
    generationBrief: {
      imagePromptPackage: { prompt: "Create a skincare infographic from the reference." },
      designFormatBrief: {
        formatType: "checklist_cards",
        structureName: "Wrong checklist",
        layoutSlots: [{ id: "point", role: "icon_row", textCapacity: "medium" }]
      },
      contentScript: { headline: "Что проверить утром", subhead: "Короткая легенда", points: ["1. Тон", "2. Текстура"] },
      visualBrief: { productUsage: "small_signal" }
    }
  });

  assert.match(prompt, /ОБЯЗАТЕЛЬНЫЙ FORMAT LOCK/);
  assert.match(prompt, /ranking_leaderboard/);
  assert.match(prompt, /rankedItems\[8-21\]/);
  assert.match(prompt, /Не превращать в минималистичный белый checklist/);
});

test("leaderboard final prompt allows ranking instead of old top ban", () => {
  const project = projects[0];
  const product = products.find((item) => item.projectId === project.id);
  const prompt = buildImagePrompt({
    project,
    product,
    reference: {
      title: "TOP 21 leaderboard",
      layoutType: "ranking_leaderboard",
      takeaways: "rank cards, value labels"
    }
  });

  assert.match(prompt, /ранги и номера разрешены только для layout формата ranking_leaderboard/);
  assert.match(prompt, /8-12 очень коротких rank-card/);
});

test("creative team image prompt renders object points as text", () => {
  const project = projects[0];
  const product = products.find((item) => item.projectId === project.id);
  const prompt = buildImagePrompt({
    project,
    product,
    reference: { title: "Чарт", layoutType: "ranking_leaderboard" },
    generationBrief: {
      imagePromptPackage: { prompt: "Use chart reference." },
      designFormatBrief: { formatType: "ranking_leaderboard" },
      contentScript: {
        headline: "Утренний рейтинг",
        subhead: "Что проверить первым",
        points: [{ rank: "1", text: "Вода утром" }, { rank: "2", text: "Ритм завтрака" }]
      }
    }
  });

  assert.doesNotMatch(prompt, /\[object Object\]/);
  assert.match(prompt, /1: Вода утром/);
  assert.match(prompt, /2: Ритм завтрака/);
});

test("creative team visual brief controls product visibility mode", () => {
  const project = projects[0];
  const product = products.find((item) => item.projectId === project.id);
  const brief = createAutoGenerationBrief({
    project,
    product,
    reference: project.references[0],
    generationBrief: { visualBrief: { productUsage: "exact_product" } }
  });

  assert.equal(brief.productVisualMode, "exact-product");
});

test("creative team brief runner executes role chain and flattens legacy fields", async () => {
  const responses = [
    { productPassport: { productName: "Магний", safeFacts: ["вечерний формат"], forbiddenClaims: ["лечит сон"] } },
    { designFormatBrief: { formatType: "ranking_leaderboard", structureName: "Рейтинг привычек", layoutSlots: [{ id: "item", role: "rank_card", textCapacity: "short" }] } },
    { attentionMap: { scrollStopperAngles: [{ angle: "Срыв вечерней рутины" }] } },
    { creativeBrief: { topic: "Почему вечерняя рутина срывается", formatIntent: "saveable_note", productBridge: "продукт уместен как часть рутины" } },
    { hookSet: [{ hook: "Вечерний ритуал срывается не случайно" }], recommendedHook: "Вечерний ритуал срывается не случайно" },
    { contentScript: { headline: "Ритуал срывается вечером", subhead: "Причина часто в ожиданиях", points: ["Сначала уберите шум", "Проверьте привычку"] } },
    { formatCompliance: { formatMatched: false, issues: ["Нужно больше rank cards"], fixedContentScript: { headline: "ТОП вечерних сбоев", subhead: "Ритуалы | проверь привычки", points: ["1: Шум", "2: Экран", "3: Кофе", "4: Поздний ужин", "5: Свет", "6: Стресс", "7: Режим", "8: Телефон"] }, finalRules: [] } },
    { visualBrief: { mainVisualObject: "вечерняя полка", productUsage: "small_signal" } },
    { safetyReview: { generationAllowed: true, issues: [], fixedContentScript: { headline: "", subhead: "", points: [] }, fixedVisualBrief: {}, finalWarnings: [] } },
    { imagePromptPackage: { provider: "gpt-image-2", prompt: "Create vertical 9:16 infographic", inputRefs: [], promptBudgetNotes: { mustKeep: [], canDropIfTooLong: [] } } }
  ];
  const calls = [];
  const draft = await runCreativeTeamBrief({
    token: "token",
    model: "test-model",
    referenceModel: "vision-model",
    callOpenRouter: async (_token, model, messages) => {
      calls.push({ model, content: messages[1].content });
      return JSON.stringify(responses.shift());
    },
    parseJsonDraft: JSON.parse,
    body: {
      project: projects[0],
      product: products[0],
      reference: projects[0].references[0],
      designReferenceImageUrls: ["https://studio.example.com/api/reference-assets/design-1"],
      existingJobs: []
    }
  });

  assert.equal(calls.length, 10);
  assert.equal(draft.productPassport.productName, "Магний");
  assert.equal(draft.designFormatBrief.formatType, "ranking_leaderboard");
  assert.equal(draft.topic, "Почему вечерняя рутина срывается");
  assert.equal(draft.hook, "Вечерний ритуал срывается не случайно");
  assert.equal(draft.plan.headline, "ТОП вечерних сбоев");
  assert.equal(draft.contentScript.points.length, 8);
  assert.equal(draft.formatCompliance.formatMatched, false);
  assert.equal(draft.imagePromptPackage.prompt, "Create vertical 9:16 infographic");
  assert.equal(calls[1].model, "vision-model");
  assert.equal(Array.isArray(calls[1].content), true);
  assert.match(calls[1].content[0].text, /format architect/);
  assert.equal(calls[1].content[1].image_url.url, "https://studio.example.com/api/reference-assets/design-1");
  assert.match(calls[5].content, /ranking_leaderboard/);
  assert.match(calls[6].content, /format compliance editor/);
  assert.match(calls[9].content, /ТОП вечерних сбоев/);
});
