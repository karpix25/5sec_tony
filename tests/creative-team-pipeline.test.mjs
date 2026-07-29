import test from "node:test";
import assert from "node:assert/strict";
import { buildImagePrompt, createAutoGenerationBrief } from "../src/domain/generation.js";
import { projects, products } from "../src/domain/entities.js";
import { runCreativeTeamBrief } from "../scripts/creative-team-prompts.mjs";
import { parseJsonDraft } from "../scripts/openrouter-response.mjs";

test("creative team image prompt package and script are authoritative", () => {
  const project = projects[0];
  const product = products.find((item) => item.projectId === project.id);
  const generationBrief = {
    topic: "AI_TOPIC_SENTINEL",
    hook: "AI_HOOK_SENTINEL",
    imagePromptPackage: { prompt: "AI_FINAL_PROMPT_SENTINEL. Use the provided design reference." },
    designFormatBrief: {
      formatType: "ranking_leaderboard",
      structureName: "Топ признаков",
      layoutSlots: [{ id: "rank", role: "rank_card", textCapacity: "short" }]
    },
    creativeBrief: { topic: "AI_CREATIVE_TOPIC_SENTINEL", formatIntent: "saveable_note" },
    contentScript: { headline: "AI_HEADLINE_SENTINEL", subhead: "AI_SUBHEAD_SENTINEL", points: ["AI_POINT_ONE", "AI_POINT_TWO"] },
    visualBrief: { mainVisualObject: "AI_VISUAL_SENTINEL", productUsage: "do_not_show", negativeVisuals: ["упаковка крупно"] }
  };
  const brief = createAutoGenerationBrief({
    project,
    product,
    reference: project.references[0],
    generationBrief
  });
  const prompt = buildImagePrompt({
    project,
    product,
    reference: project.references[0],
    generationBrief
  });

  assert.equal(brief.topic, "AI_TOPIC_SENTINEL");
  assert.equal(brief.hook, "AI_HOOK_SENTINEL");
  assert.equal(brief.finalContent.headline, "AI_HEADLINE_SENTINEL");
  assert.equal(brief.aiPlan.points[1], "AI_POINT_TWO");
  assert.equal(brief.visualObject, "AI_VISUAL_SENTINEL");
  assert.match(prompt, /AI_FINAL_PROMPT_SENTINEL/);
  assert.match(prompt, /AI_HEADLINE_SENTINEL/);
  assert.match(prompt, /AI_POINT_ONE/);
  assert.match(prompt, /ФИНАЛЬНЫЙ РЕНДЕР-КОНТРАКТ/);
  assert.match(prompt, /ЯЗЫК НА ИЗОБРАЖЕНИИ/);
  assert.match(prompt, /АНГЛИЙСКИЙ ТЕКСТ ИЗ DESIGN REFERENCE/);
  assert.match(prompt, /КОМПОЗИЦИЯ И ОТСТУПЫ/);
  assert.match(prompt, /SAFE ZONE REFERENCE/);
  assert.match(prompt, /1080x1920/);
  assert.match(prompt, /x=150\.\.830/);
  assert.match(prompt, /y=280\.\.1300/);
  assert.match(prompt, /x=830\.\.1080/);
  assert.match(prompt, /VISIBLE TEXT WHITELIST/);
  assert.match(prompt, /ЖЕСТКАЯ ПУСТАЯ ВЕРХНЯЯ ЗОНА/);
  assert.match(prompt, /y=0\.\.280 полностью без букв/);
  assert.match(prompt, /ЖЕСТКАЯ ПУСТАЯ НИЖНЯЯ ЗОНА/);
  assert.match(prompt, /y=1300\.\.1920 полностью без букв/);
  assert.match(prompt, /y=1344\.\.1920/);
  assert.match(prompt, /Белая область safe-zone маски/);
  assert.match(prompt, /Фиолетовая область safe-zone маски/);
  assert.match(prompt, /не дизайн-референс, не палитра, не фон/);
  assert.match(prompt, /центральных 76-80% ширины/);
  assert.match(prompt, /нижние 30% кадра/);
  assert.match(prompt, /Запрещено касание краев/);
  assert.doesNotMatch(prompt, /СМЫСЛОВОЙ ПЛАН ДЛЯ ТЕКСТА/);
  assert.doesNotMatch(prompt, /Почему после воды хочется кофе|Когда нет сил на спорт|Крем нанесли/i);
});

test("creative team prompt package is not replaced by local leaderboard prompt", () => {
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
      imagePromptPackage: { prompt: "AI_SAFE_LEADERBOARD_PROMPT: use a dense visual ranking based on the design reference." },
      visualBrief: { productUsage: "small_signal" }
    }
  });

  assert.match(prompt, /AI_SAFE_LEADERBOARD_PROMPT/);
  assert.match(prompt, /ТЕХНИЧЕСКИЕ ПРАВИЛА РЕНДЕРА/);
  assert.match(prompt, /Топ признаков/);
  assert.doesNotMatch(prompt, /ПЛАН РОЛИ ПРОДУКТА/);
  assert.doesNotMatch(prompt, /ОБЯЗАТЕЛЬНАЯ ФИКСАЦИЯ ФОРМАТА/);
  assert.doesNotMatch(prompt, /КОНТРАКТ СЛЕДОВАНИЯ РЕФЕРЕНСУ/);
  assert.doesNotMatch(prompt, /Фон референса: dark blue cosmic poster/);
});

test("ai prompt package keeps final prompt ownership for leaderboard references", () => {
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

  assert.match(prompt, /Adapt the wellness checklist into the chart reference/);
  assert.match(prompt, /Усталость или сигнал организма/);
  assert.doesNotMatch(prompt, /ПЛАН АДАПТАЦИИ ПОД РЕЙТИНГ/);
  assert.doesNotMatch(prompt, /TOP 10 или TOP 12 chart/);
  assert.doesNotMatch(prompt, /Исходных пунктов 5/);
});

test("creative team prompt does not synthesize local format lock when ai format brief is wrong", () => {
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

  assert.match(prompt, /Create a skincare infographic from the reference/);
  assert.match(prompt, /Что проверить утром/);
  assert.doesNotMatch(prompt, /ОБЯЗАТЕЛЬНАЯ ФИКСАЦИЯ ФОРМАТА/);
  assert.doesNotMatch(prompt, /rankedItems\[8-21\]/);
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

  assert.match(prompt, /ПЛАН ВИЗУАЛИЗАЦИИ ПРОДУКТА: product-absent/);
  assert.match(prompt, /retention visual/);
  assert.match(prompt, /нижний правый угол работает как чистое негативное пространство/);
  assert.doesNotMatch(prompt, /SONRE|Хлорофилл|chlorophyll|Show SONRE|Бутылка на столе/i);
  assert.doesNotMatch(prompt, /Подзаголовок: ТОП 10 привычек/);
});

test("creative team prompt removes visible medicine disclaimers", () => {
  const project = projects[0];
  const product = products.find((item) => item.projectId === project.id);
  const prompt = buildImagePrompt({
    project,
    product,
    reference: project.references[0],
    generationBrief: {
      productVisualMode: "exact-product",
      imagePromptPackage: { prompt: "Vertical wellness poster. Add a note: Не является лекарственным средством." },
      contentScript: {
        headline: "Почему вода не бодрит",
        subhead: "Проверьте ритуал утром",
        points: ["Вода работает как база", "Не является лекарственным средством", "Скучный вкус ломает привычку"]
      },
      visualBrief: { productUsage: "exact_product" }
    }
  });

  assert.match(prompt, /Почему вода не бодрит/);
  assert.match(prompt, /Скучный вкус ломает привычку/);
  assert.doesNotMatch(prompt, /не является лекарственным средством|лекарственным средством/i);
});

test("creative team retries a malformed role JSON draft before failing the brief", async () => {
  const responses = [
    "Конечно, вот черновик без JSON",
    { productPassport: { productName: "Шиммер", safeFacts: ["косметический продукт"], forbiddenClaims: [] } },
    { designFormatBrief: { formatType: "checklist_cards", structureName: "Checklist" } },
    { attentionMap: { scrollStopperAngles: [{ angle: "Патчи скатываются" }] } },
    { creativeBrief: { topic: "Почему патчи скатываются", formatIntent: "saveable_note", productBridge: "шиммер уместен как мягкий косметический контекст" } },
    { hookSet: [{ hook: "Патчи скатываются не просто так" }], recommendedHook: "Патчи скатываются не просто так" },
    { contentScript: { headline: "Патчи скатываются не просто так", subhead: "Причина часто в слое ухода", points: ["Крем оставляет пленку", "Консилер снижает сцепление", "Кожа слишком влажная", "Патч не успевает лечь"] } },
    { formatCompliance: { formatMatched: true, issues: [], fixedContentScript: {}, finalRules: [] } },
    { visualBrief: { mainVisualObject: "гелевые патчи", productUsage: "small_signal" } },
    { safetyReview: { generationAllowed: true, issues: [], fixedContentScript: { headline: "", subhead: "", points: [] }, fixedVisualBrief: {}, finalWarnings: [] } },
    { imagePromptPackage: { provider: "gpt-image-2", prompt: "Create cosmetic checklist", inputRefs: [], promptBudgetNotes: { mustKeep: [], canDropIfTooLong: [] } } }
  ];
  const systemPrompts = [];

  const draft = await runCreativeTeamBrief({
    token: "token",
    model: "test-model",
    callOpenRouter: async (_token, _model, messages) => {
      systemPrompts.push(messages[0].content);
      const response = responses.shift();
      return typeof response === "string" ? response : JSON.stringify(response);
    },
    parseJsonDraft,
    body: { project: projects[0], product: products[0], reference: projects[0].references[0], existingJobs: [] }
  });

  assert.equal(draft.productPassport.productName, "Шиммер");
  assert.equal(systemPrompts.length, 11);
  assert.match(systemPrompts[1], /Предыдущий ответ был отклонен/);
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
  const passportPrompt = JSON.parse(calls[0].content);
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
  assert.match(calls[1].content[0].text, /safeZoneAdaptation/);
  assert.match(calls[1].content[0].text, /edge pressure/);
  assert.match(calls[1].content[0].text, /x=150\.\.830, y=280\.\.1300/);
  assert.equal(calls[1].content[1].image_url.url, "https://studio.example.com/api/reference-assets/design-1");
  assert.match(calls[5].content, /ranking_leaderboard/);
  assert.match(calls[6].content, /format compliance editor/);
  assert.match(calls[9].content, /ТОП вечерних сбоев/);
  const imagePromptInstruction = JSON.parse(calls[9].content);
  assert.match(imagePromptInstruction.rules.join(" "), /все заголовки, карточки, подписи, легенды и служебные ярлыки замени русским текстом/);
  assert.match(imagePromptInstruction.rules.join(" "), /role=safe_zone/);
  assert.match(imagePromptInstruction.rules.join(" "), /служебная 9:16 маска размещения/);
  assert.match(imagePromptInstruction.rules.join(" "), /RECREATE DESIGN REFERENCE INSIDE SAFE-ZONE/);
  assert.match(imagePromptInstruction.rules.join(" "), /1080x1920/);
  assert.match(imagePromptInstruction.rules.join(" "), /x=150\.\.830/);
  assert.match(imagePromptInstruction.rules.join(" "), /y=280\.\.1300/);
  assert.match(imagePromptInstruction.rules.join(" "), /ЖЕСТКАЯ ПУСТАЯ ВЕРХНЯЯ ЗОНА/);
  assert.match(imagePromptInstruction.rules.join(" "), /минимум 620px от нижнего края/);
  assert.match(imagePromptInstruction.rules.join(" "), /примерно 250px справа/);
  assert.match(imagePromptInstruction.rules.join(" "), /ЖЕСТКАЯ ПУСТАЯ НИЖНЯЯ ЗОНА/);
  assert.match(imagePromptInstruction.rules.join(" "), /DESIGN REFERENCE FIDELITY GATE/);
  assert.match(imagePromptInstruction.rules.join(" "), /Сохраняй macro-layout дизайн-референса/);
  assert.doesNotMatch(imagePromptInstruction.rules.join(" "), /safe_zone важнее|приоритет всегда у safe-zone/i);
  assert.match(imagePromptInstruction.rules.join(" "), /Отступы обязательны/);
  assert.equal(Object.hasOwn(passportPrompt, "project"), false);
  assert.equal(Object.hasOwn(passportPrompt, "reference"), false);
  assert.equal(Object.hasOwn(passportPrompt.product, "references"), false);
  assert.doesNotMatch(calls[0].content, /reference-assets|designReference|avatar|imageUrl|imageData/i);
});

test("creative team runner records leaderboard text contract issues without writing replacement copy", async () => {
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

  assert.equal(draft.contentScript.headline, "Усталость или сигнал организма?");
  assert.match(draft.contentScript.subhead, /5 маркеров/i);
  assert.equal(draft.contentScript.points.length, 5);
  assert.deepEqual(draft.textContractViolations, ["headline_not_top_chart", "subhead_old_count", "not_enough_rank_items"]);
  assert.match(calls[7].content, /Усталость или сигнал организма/);
  assert.match(calls[9].content, /Усталость или сигнал организма/);
  assert.match(calls[9].content, /5 маркеров/i);
  assert.match(draft.safetyReview.finalWarnings.join(" "), /Design text contract still has violations/);
});

test("creative team runner records leaderboard contract issues after safety edits", async () => {
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

  assert.equal(draft.contentScript.headline, "12 привычек, крадущих энергию");
  assert.equal(draft.contentScript.points.length, 12);
  assert.equal(draft.safetyReview.fixedContentScript.headline, "12 привычек, крадущих энергию");
  assert.deepEqual(draft.textContractViolations, ["headline_not_top_chart"]);
  assert.match(draft.safetyReview.finalWarnings.join(" "), /Design text contract still has violations/);
  assert.match(calls[9].content, /12 привычек, крадущих энергию/);
});
