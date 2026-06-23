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
    { visualBrief: { mainVisualObject: "вечерняя полка", productUsage: "small_signal" } },
    { safetyReview: { generationAllowed: true, issues: [], fixedContentScript: { headline: "", subhead: "", points: [] }, fixedVisualBrief: {}, finalWarnings: [] } },
    { imagePromptPackage: { provider: "gpt-image-2", prompt: "Create vertical 9:16 infographic", inputRefs: [], promptBudgetNotes: { mustKeep: [], canDropIfTooLong: [] } } }
  ];
  const calls = [];
  const draft = await runCreativeTeamBrief({
    token: "token",
    model: "test-model",
    callOpenRouter: async (_token, _model, messages) => {
      calls.push(messages[1].content);
      return JSON.stringify(responses.shift());
    },
    parseJsonDraft: JSON.parse,
    body: { project: projects[0], product: products[0], reference: projects[0].references[0], existingJobs: [] }
  });

  assert.equal(calls.length, 9);
  assert.equal(draft.productPassport.productName, "Магний");
  assert.equal(draft.designFormatBrief.formatType, "ranking_leaderboard");
  assert.equal(draft.topic, "Почему вечерняя рутина срывается");
  assert.equal(draft.hook, "Вечерний ритуал срывается не случайно");
  assert.equal(draft.plan.headline, "Ритуал срывается вечером");
  assert.equal(draft.imagePromptPackage.prompt, "Create vertical 9:16 infographic");
  assert.match(calls[1], /format architect/);
  assert.match(calls[5], /ranking_leaderboard/);
});
