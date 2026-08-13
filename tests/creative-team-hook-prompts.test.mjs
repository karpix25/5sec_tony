import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const promptSource = readFileSync(new URL("../scripts/creative-team-prompts.mjs", import.meta.url), "utf8");
const headlineContractSource = readFileSync(new URL("../src/domain/headline-style-contract.js", import.meta.url), "utf8");

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
