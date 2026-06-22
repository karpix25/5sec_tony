import test from "node:test";
import assert from "node:assert/strict";
import { createHookIntelligence } from "../src/domain/hook-intelligence.js";

test("hook intelligence classifies library hook mechanics", () => {
  const cases = [
    ["N лучших мест для посещения в городе", "collection"],
    ["Клиенты вы точно этому не поверите!", "surprise-fact"],
    ["После месяца ухода это наконец-то случилось!", "experiment"],
    ["Почему твой уход не работает?", "diagnosis"],
    ["N причины НЕ начинать хаотично", "anti-advice"],
    ["Самый важный совет, который я получил", "insider"],
    ["Как выглядит самый странный запрет в мире?", "visual-curiosity"]
  ];

  cases.forEach(([source, type]) => {
    const intelligence = createHookIntelligence(source);
    assert.equal(intelligence.hookType, type);
    assert.equal(intelligence.sourceHook, source);
    assert.ok(intelligence.attentionMechanism);
    assert.ok(intelligence.expectedStructure);
    assert.ok(intelligence.hookPromise);
  });
});

test("hook intelligence rejects generic adaptation risks", () => {
  const intelligence = createHookIntelligence("N причины НЕ делать это");

  assert.equal(intelligence.hookType, "anti-advice");
  assert.ok(intelligence.badAdaptations.some((item) => /атака на продукт/.test(item)));
  assert.ok(intelligence.badAdaptations.some((item) => /механическая подстановка/.test(item)));
});
