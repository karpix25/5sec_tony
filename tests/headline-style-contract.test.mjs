import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildImagePrompt } from "../src/domain/generation.js";
import { projects, products } from "../src/domain/entities.js";
import { formatHeadlineStyleInstruction } from "../src/domain/headline-style-contract.js";

test("headline style contract asks for honest clickbait and simple language", () => {
  const instruction = formatHeadlineStyleInstruction();

  assert.match(instruction, /scroll-stopper/i);
  assert.match(instruction, /уровень 5 класса/i);
  assert.match(instruction, /без выдуманных фактов/i);
  assert.match(instruction, /слишком поздно|зря|перед покупкой/i);
});

test("image prompt carries clickbait headline and plain-language rules", () => {
  const project = projects[0];
  const product = products.find((item) => item.projectId === project.id);
  const prompt = buildImagePrompt({
    project,
    product,
    reference: project.references[0],
    character: project.characters[0],
    generationBrief: {
      topic: "проверка ожиданий перед покупкой",
      hook: "Что проверить до покупки",
      aiPlan: {
        headline: "Что проверить до покупки",
        subhead: "Один простой шаг экономит нервы",
        points: ["Проверьте ожидание", "Сравните с обычной привычкой", "Не ждите магии"]
      }
    }
  });

  assert.match(prompt, /СТИЛЬ ЗАГОЛОВКА/);
  assert.match(prompt, /уровень 5 класса/i);
  assert.match(prompt, /Кликбейт разрешен только честный/i);
});

test("creative team prompts include simple clickbait headline guidance", () => {
  const source = readFileSync(new URL("../scripts/creative-team-prompts.mjs", import.meta.url), "utf8");

  assert.match(source, /clickbaitHeadlineRules/);
  assert.match(source, /simpleAudienceLanguageRules/);
});
