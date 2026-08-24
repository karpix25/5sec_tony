import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const promptSource = readFileSync(new URL("../scripts/creative-team-prompts.mjs", import.meta.url), "utf8");
const headlineContractSource = readFileSync(new URL("../src/domain/headline-style-contract.js", import.meta.url), "utf8");
const productWorldSource = readFileSync(new URL("../src/domain/product-world.js", import.meta.url), "utf8");

test("creative team prompts require reels hooks with explicit payoff", () => {
  const source = `${promptSource}\n${headlineContractSource}`;

  assert.match(source, /Первые 3 секунды важнее красоты формулировки/);
  assert.match(source, /payoffQuestion/);
  assert.match(source, /recommendedPayoffQuestion/);
  assert.match(source, /первые 2 points обязаны прямо закрывать это обещание/i);
  assert.match(source, /Если headline спрашивает 'почему', points дают причины/);
  assert.match(source, /Не выбирай recommendedHook, если он звучит как тема статьи/);
  assert.match(source, /Не выходи из безопасной зоны/);
});

test("creative team prompts reject neutral article-style headlines", () => {
  const source = `${promptSource}\n${headlineContractSource}`;

  assert.match(source, /Запрещены нейтральные обложки без конфликта/);
  assert.match(source, /мифы vs реальность/);
  assert.match(source, /разбор/);
  assert.match(source, /полезные факты/);
  assert.match(source, /Хук должен быть визуально проверяемым/);
  assert.match(source, /что именно будет разобрано на экране/);
});

test("creative team separates product world, brand context and hook mechanism", () => {
  const source = `${promptSource}\n${productWorldSource}`;

  assert.match(source, /projectContext/);
  assert.match(source, /productWorld/);
  assert.match(source, /guidesAndRecommendations/);
  assert.match(source, /habitsAndMistakes/);
  assert.match(source, /Механику внимания выбирай из текущей темы/i);
  assert.match(source, /товаров одной категории/i);
  assert.doesNotMatch(source, /hookLibrary|hookSeed/);
});

test("hook producer varies mechanisms and avoids question monoculture", () => {
  const source = `${promptSource}\n${headlineContractSource}`;

  assert.match(source, /Все 5 вариантов должны использовать разные механики/);
  assert.match(source, /Не более одного варианта может быть вопросом/);
  assert.match(source, /«почему» допустимо максимум в одном варианте/i);
  assert.match(source, /конкретике, свежести, ясному конфликту и сильному payoff/);
  assert.match(source, /Каждый point добавляет новый факт, причину, наблюдение или действие/);
});
