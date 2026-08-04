import test from "node:test";
import assert from "node:assert/strict";
import { humanizeTextInstruction } from "../scripts/creative-team-prompts.mjs";
import { normalizeHumanizedPlan } from "../src/domain/text-humanizer.js";

test("ru-text editorial rules are included in the shared humanizer prompt", () => {
  const prompt = JSON.parse(humanizeTextInstruction({ plan: { headline: "Заголовок", points: [] } }));
  assert.match(prompt.rules.join("\n"), /РУССКАЯ ВЫЧИТКА/);
  assert.match(prompt.rules.join("\n"), /канцелярита/);
  assert.match(prompt.rules.join("\n"), /типографику/);
});

test("humanizer keeps replacement-character protection with ru-text enabled", () => {
  const plan = normalizeHumanizedPlan(
    { headline: "Проверка� текста", subhead: "", points: ["Простая� причина"] },
    { headline: "Запасной текст", subhead: "", points: [] }
  );
  assert.doesNotMatch(JSON.stringify(plan), /\uFFFD/);
});
