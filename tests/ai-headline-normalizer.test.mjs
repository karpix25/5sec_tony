import test from "node:test";
import assert from "node:assert/strict";
import { normalizeAiHeadlineContent } from "../src/domain/ai-headline-normalizer.js";

test("AI headline content rotates repeated why formula", () => {
  const content = normalizeAiHeadlineContent({
    content: { headline: "Почему привычка не дает результата", subhead: "Тезис", points: [] },
    project: { id: "project-1", audiencePains: "вечером сложно восстановиться" },
    product: { id: "product-1", name: "Продукт", offer: "спокойное восстановление" },
    existingJobs: [
      { title: "Почему вечером сложно восстановиться" },
      { finalContent: { headline: "Почему привычка не помогает" } }
    ]
  });

  assert.notEqual(content.headline, "Почему привычка не дает результата");
  assert.doesNotMatch(content.headline, /^Почему(?:\s|$)/i);
});

test("AI headline normalizer preserves locked content", () => {
  const content = normalizeAiHeadlineContent({
    content: { headline: "Почему это важно", subhead: "Тезис", points: [] },
    generationBrief: { headlineLocked: true },
    existingJobs: [{ title: "Почему одно" }, { title: "Почему два" }]
  });

  assert.equal(content.headline, "Почему это важно");
});
