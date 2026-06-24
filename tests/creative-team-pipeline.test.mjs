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
        layoutSlots: [{ id: "rank", role: "rank_card", textCapacity: "short" }],
        visualGrammar: {
          composition: "dense vertical top chart",
          background: "dark blue cosmic poster",
          palette: "gold, white and cyan glow",
          typography: "bold condensed poster type",
          imageTreatment: "cutout portraits inside glowing bars",
          hierarchy: "gold title first",
          framesAndDividers: "cyan glowing card outlines"
        }
      },
      contentScript: { headline: "Топ признаков", subhead: "Короткая легенда", points: ["1. Первый сигнал", "2. Второй сигнал"] },
      imagePromptPackage: { prompt: "Show a large SONRE bottle and write that it helps restore energy." },
      visualBrief: { productUsage: "small_signal" }
    }
  });

  assert.match(prompt.slice(0, 260), /PRODUCT DOMINANCE OVERRIDE/);
  assert.match(prompt, /ФИНАЛЬНЫЙ ТЕКСТОВЫЙ КОНТРАКТ ДЛЯ TOP-CHART/);
  assert.match(prompt, /ОБЯЗАТЕЛЬНЫЙ FORMAT LOCK/);
  assert.match(prompt, /ВЫШЕ ВСЕХ НИЖЕСТОЯЩИХ ИНСТРУКЦИЙ/);
  assert.match(prompt, /REFERENCE TRACE CONTRACT/);
  assert.match(prompt, /leaderboard\/top-chart skeleton/);
  assert.match(prompt, /ранговые колонки|rank cards/);
  assert.match(prompt, /не делать горизонтальные строки|horizontal rows/);
  assert.match(prompt, /темный насыщенный фон/);
  assert.match(prompt, /Фон референса: dark blue cosmic poster/);
  assert.match(prompt, /Палитра референса: gold, white and cyan glow/);
  assert.match(prompt, /Типографика референса: bold condensed poster type/);
  assert.match(prompt, /Обработка изображений референса: cutout portraits inside glowing bars/);
  assert.match(prompt, /нельзя менять skeleton на белый лист/);
  assert.match(prompt, /Не превращать в горизонтальный список/);
  assert.match(prompt, /PRODUCT DOMINANCE OVERRIDE/);
  assert.match(prompt, /COLOR OVERRIDE/);
  assert.match(prompt, /Не рисовать крупную упаковку/);
  assert.doesNotMatch(prompt, /Show a large SONRE bottle/i);
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
  assert.match(prompt, /Не превращать в горизонтальный список/);
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
  assert.match(prompt, /Финальный top-chart должен содержать 8-12 коротких rank cards/);
  assert.doesNotMatch(prompt, /количество видимых пунктов: [1-7], больше не добавлять/);
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

test("leaderboard creative team brief suppresses product image dominance", () => {
  const project = projects[0];
  const product = products.find((item) => item.projectId === project.id);
  const brief = createAutoGenerationBrief({
    project,
    product,
    reference: { title: "Чарт", layoutType: "ranking_leaderboard" },
    generationBrief: {
      designFormatBrief: { formatType: "ranking_leaderboard" },
      visualBrief: { productUsage: "exact_product" },
      contentScript: {
        headline: "ТОП 12 сигналов",
        subhead: "Маркеры дня | проверь привычки",
        points: ["1: Вода", "2: Сон", "3: Фокус", "4: Режим", "5: Свет", "6: Экран", "7: Движение", "8: Завтрак"]
      }
    }
  });

  assert.equal(brief.productVisualMode, "no-package");
});

test("no-package creative team prompt removes product names and packaging cues", () => {
  const project = projects[0];
  const product = products.find((item) => item.projectId === project.id);
  const prompt = buildImagePrompt({
    project: { ...project, productInFramePercent: 0 },
    product,
    reference: { title: "TOP 10 chart", layoutType: "ranking_leaderboard" },
    generationBrief: {
      productVisualMode: "no-package",
      productPassport: { productName: "Хлорофилл", safeFacts: ["напиток"], forbiddenClaims: [] },
      designFormatBrief: { formatType: "ranking_leaderboard" },
      contentScript: {
        headline: "ТОП 10 привычек",
        subhead: "ТОП 10 привычек",
        points: ["Хлорофилл SONRE: приятный ритуал", "Бутылка на столе", "Вода утром"]
      },
      imagePromptPackage: {
        provider: "gpt-image-2",
        prompt: "Show SONRE chlorophyll bottle package as product packshot.",
        inputRefs: []
      }
    }
  });

  assert.match(prompt, /РЕЖИМ ПРОДУКТА В КАДРЕ: no-package/);
  assert.doesNotMatch(prompt, /SONRE|Хлорофилл|chlorophyll|Show SONRE|Бутылка на столе/i);
  assert.doesNotMatch(prompt, /Подзаголовок: ТОП 10 привычек/);
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

test("creative team runner enforces leaderboard text contract after weak compliance pass", async () => {
  const responses = [
    { productPassport: { productName: "Хлорофилл", safeFacts: ["напиток"], forbiddenClaims: [] } },
    { designFormatBrief: { formatType: "ranking_leaderboard", textContract: { preferredItems: 10 }, structureName: "Top chart" } },
    { attentionMap: { scrollStopperAngles: [{ angle: "Усталость днем" }] } },
    { creativeBrief: { topic: "Усталость или сигнал организма", formatIntent: "saveable_note", productBridge: "мягкий wellness-сигнал" } },
    { hookSet: [{ hook: "Усталость не всегда про сон" }], recommendedHook: "Усталость не всегда про сон" },
    { contentScript: { headline: "Усталость или сигнал организма?", subhead: "5 маркеров, что пора пересмотреть привычки", points: ["Кожа стала тусклой", "Энергия падает к 16:00", "Трудности с концентрацией", "Сложно пить воду", "Тяжелый подъем"] } },
    { formatCompliance: { formatMatched: true, issues: [], fixedContentScript: {}, finalRules: [] } },
    { visualBrief: { mainVisualObject: "top chart", productUsage: "small_signal" } },
    { safetyReview: { generationAllowed: true, issues: [], fixedContentScript: { headline: "", subhead: "", points: [] }, fixedVisualBrief: {}, finalWarnings: [] } },
    { imagePromptPackage: { provider: "gpt-image-2", prompt: "Create top chart", inputRefs: [], promptBudgetNotes: { mustKeep: [], canDropIfTooLong: [] } } }
  ];
  const calls = [];
  const draft = await runCreativeTeamBrief({
    token: "token",
    model: "test-model",
    callOpenRouter: async (_token, model, messages) => {
      calls.push({ model, content: messages[1].content });
      return JSON.stringify(responses.shift());
    },
    parseJsonDraft: JSON.parse,
    body: { project: projects[0], product: products[0], reference: projects[0].references[0], existingJobs: [] }
  });

  assert.match(draft.contentScript.headline, /^ТОП 10:/);
  assert.doesNotMatch(draft.contentScript.subhead, /5 маркеров/i);
  assert.equal(draft.contentScript.points.length, 10);
  assert.deepEqual(draft.textContractViolations, ["headline_not_top_chart", "subhead_old_count", "not_enough_rank_items"]);
  assert.match(calls[7].content, /ТОП 10:/);
  assert.match(calls[9].content, /ТОП 10:/);
  assert.doesNotMatch(calls[9].content, /5 маркеров/i);
});

test("creative team runner re-enforces leaderboard contract after safety edits", async () => {
  const responses = [
    { productPassport: { productName: "Хлорофилл", safeFacts: ["напиток"], forbiddenClaims: [] } },
    { designFormatBrief: { formatType: "ranking_leaderboard", textContract: { preferredItems: 12 }, structureName: "Top chart" } },
    { attentionMap: { scrollStopperAngles: [{ angle: "Усталость днем" }] } },
    { creativeBrief: { topic: "Усталость или сигнал организма", formatIntent: "saveable_note", productBridge: "мягкий wellness-сигнал" } },
    { hookSet: [{ hook: "Усталость не всегда про сон" }], recommendedHook: "Усталость не всегда про сон" },
    { contentScript: { headline: "ТОП 12 сигналов", subhead: "Маркеры дня | проверь привычки", points: ["1: Вода", "2: Сон", "3: Свет", "4: Экран", "5: Завтрак", "6: Движение", "7: Режим", "8: Фокус", "9: Пауза", "10: Вкус", "11: Комфорт", "12: Ритуал"] } },
    { formatCompliance: { formatMatched: true, issues: [], fixedContentScript: {}, finalRules: [] } },
    { visualBrief: { mainVisualObject: "top chart", productUsage: "small_signal" } },
    { safetyReview: { generationAllowed: true, issues: [], fixedContentScript: { headline: "12 привычек, крадущих энергию", subhead: "Проверь привычки", points: ["Вода", "Сон", "Свет", "Экран", "Завтрак", "Движение", "Режим", "Фокус", "Пауза", "Вкус", "Комфорт", "Ритуал"] }, fixedVisualBrief: {}, finalWarnings: [] } },
    { imagePromptPackage: { provider: "gpt-image-2", prompt: "Create top chart", inputRefs: [], promptBudgetNotes: { mustKeep: [], canDropIfTooLong: [] } } }
  ];
  const calls = [];
  const draft = await runCreativeTeamBrief({
    token: "token",
    model: "test-model",
    callOpenRouter: async (_token, model, messages) => {
      calls.push({ model, content: messages[1].content });
      return JSON.stringify(responses.shift());
    },
    parseJsonDraft: JSON.parse,
    body: { project: projects[0], product: products[0], reference: projects[0].references[0], existingJobs: [] }
  });

  assert.match(draft.contentScript.headline, /^ТОП 12/);
  assert.equal(draft.contentScript.points.length, 12);
  assert.equal(draft.safetyReview.fixedContentScript.headline, draft.contentScript.headline);
  assert.deepEqual(draft.textContractViolations, ["headline_not_top_chart"]);
  assert.match(calls[9].content, /ТОП 12/);
});
