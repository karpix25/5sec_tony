import test from "node:test";
import assert from "node:assert/strict";
import { projects, products } from "../src/domain/entities.js";
import { createGenerationJob } from "../src/domain/generation.js";
import { IMAGE_PROMPT_MAX_CHARS, compactImagePromptSource, limitImagePrompt } from "../src/domain/image-prompt-budget.js";

test("image prompt budget keeps essential generation instructions under provider limit", () => {
  const project = makeHugeProject(projects[0]);
  const product = makeHugeProduct(products.find((item) => item.projectId === project.id) || products[0]);
  const reference = makeHugeReference(project.references[0]);
  const job = createGenerationJob({
    project: { ...project, references: [reference] },
    product,
    reference,
    character: project.characters[0],
    freePrompt: repeatText("дополнительное пожелание оператора", 140)
  });

  assert.ok(job.prompt.length <= IMAGE_PROMPT_MAX_CHARS);
  assert.match(job.prompt, /ЯЗЫК НА ИЗОБРАЖЕНИИ/);
  assert.match(job.prompt, /КОМПОЗИЦИЯ И ОТСТУПЫ/);
  assert.match(job.prompt, /Reels\/TikTok\/Shorts/);
  assert.match(job.prompt, /CTA НА ИЗОБРАЖЕНИИ ЗАПРЕЩЕН/);
  assert.match(job.prompt, /ТОЧНОСТЬ ПРОДУКТА/);
  assert.match(job.prompt, /Тема инфографики/);
  assert.match(job.prompt, /Референс подачи/);
});

test("default project fixtures stay inside image prompt budget", () => {
  for (const project of projects) {
    const product = products.find((item) => item.projectId === project.id) || products[0];
    const reference = project.references[0];
    const job = createGenerationJob({ project, product, reference, character: project.characters[0] });
    assert.ok(job.prompt.length <= IMAGE_PROMPT_MAX_CHARS, `${project.id}/${product.id}: ${job.prompt.length}`);
  }
});

test("prompt budget compacts long optional context while preserving required sentences", () => {
  const prompt = limitImagePrompt([
    "GPT Image 2: создай вертикальную рекламную инфографику 9:16.",
    "ЯЗЫК НА ИЗОБРАЖЕНИИ: весь видимый текст строго на русском языке.",
    "CTA НА ИЗОБРАЖЕНИИ ЗАПРЕЩЕН: не рисовать кнопки.",
    repeatText("Длинный необязательный контекст компании", 300),
    "Заголовок: Важная тема.",
    "Подзаголовок: Короткое объяснение."
  ].join(" "), 900);

  assert.ok(prompt.length <= 900);
  assert.match(prompt, /GPT Image 2/);
  assert.match(prompt, /ЯЗЫК НА ИЗОБРАЖЕНИИ/);
  assert.match(prompt, /CTA НА ИЗОБРАЖЕНИИ ЗАПРЕЩЕН/);
  assert.match(prompt, /Заголовок: Важная тема/);
});

test("source compaction prefers complete clauses before truncating", () => {
  const compact = compactImagePromptSource("Первый важный факт; Второй важный факт; " + repeatText("лишняя строка", 40), 55);
  assert.match(compact, /Первый важный факт/);
  assert.ok(compact.length <= 55);
});

function makeHugeProject(project) {
  const longText = repeatText("важный контекст проекта, аудитории, ограничений и сценариев", 100);
  return {
    ...project,
    projectTheme: longText,
    keyScenarios: longText,
    audiencePains: longText,
    audienceDesires: longText,
    audienceObjections: longText,
    allowedTriggers: longText,
    forbiddenTriggers: longText,
    contentRestrictions: longText,
    companyInfo: longText,
    companyAudience: longText,
    restrictions: longText
  };
}

function makeHugeProduct(product) {
  const longText = repeatText("важная деталь продукта и безопасного обещания", 100);
  return {
    ...product,
    description: longText,
    components: longText,
    pains: [longText, longText],
    facts: [longText, longText],
    forbidden: [longText, longText],
    references: [{ title: "Упаковка", promptComment: longText, imageData: "" }]
  };
}

function makeHugeReference(reference) {
  const longText = repeatText("визуальный прием референса, типографика и композиция", 100);
  return {
    ...reference,
    takeaways: longText,
    avoidCopy: longText,
    palette: longText,
    fontStyle: longText,
    headlineStyle: longText,
    textDensity: longText
  };
}

function repeatText(text, count) {
  return Array.from({ length: count }, () => text).join(". ");
}
