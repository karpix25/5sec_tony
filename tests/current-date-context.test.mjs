import test from "node:test";
import assert from "node:assert/strict";
import { formatCurrentDatePrompt } from "../src/domain/current-date-context.js";
import { buildImagePrompt } from "../src/domain/generation.js";
import { buildImageRenderPrompt } from "../src/domain/image-render-prompt.js";
import { projects, products } from "../src/domain/entities.js";
import { humanizeTextInstruction } from "../scripts/creative-team-prompts.mjs";

test("current date prompt exposes the actual current year and bans stale reference years", () => {
  const prompt = formatCurrentDatePrompt(new Date("2026-06-23T12:00:00.000Z"));

  assert.match(prompt, /АКТУАЛЬНАЯ ДАТА/);
  assert.match(prompt, /Текущий год: 2026/);
  assert.match(prompt, /2025/);
  assert.match(prompt, /заменить на 2026/);
});

test("image generation prompt carries current date rules", () => {
  const project = projects[0];
  const product = products.find((item) => item.projectId === project.id);
  const prompt = buildImagePrompt({
    project,
    product,
    reference: { ...project.references[0], title: "TOP 2025 chart" },
    generationBrief: {
      imagePromptPackage: { prompt: "Use the provided design reference." },
      contentScript: { headline: "ТОП привычек", subhead: "Рейтинг года", points: ["Первый", "Второй"] }
    }
  });

  assert.match(prompt, /АКТУАЛЬНАЯ ДАТА/);
  assert.match(prompt, new RegExp(`Текущий год: ${new Date().getFullYear()}`));
  assert.match(prompt, /не писать старые годы из референса/);
});

test("creative team text and render prompts receive current date rules", () => {
  const instruction = humanizeTextInstruction({ project: {}, product: {}, plan: {}, brief: {} });
  const renderPrompt = buildImageRenderPrompt({
    strategy: { productName: "Product", productBridge: "Bridge", visualObject: "Card" },
    card: { headline: "Хук", subhead: "Тезис", points: ["Пункт"], layout: "poster" },
    reference: { title: "Reference 2025" }
  });

  assert.match(instruction, /АКТУАЛЬНАЯ ДАТА/);
  assert.match(renderPrompt, /АКТУАЛЬНАЯ ДАТА/);
  assert.match(renderPrompt, /2025/);
  assert.match(renderPrompt, /Видимый текст/);
  assert.match(renderPrompt, /Верхний хук/);
  assert.doesNotMatch(renderPrompt, /Visible text|Top hook|Point 1|Footer/);
});
