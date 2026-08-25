import test from "node:test";
import assert from "node:assert/strict";
import { getUnsupportedClaimViolations, repairUnsupportedClaims } from "../src/domain/content-claim-contract.js";

const context = {
  product: {
    name: "Крем для кожи вокруг глаз",
    description: "Легкий крем с тремя пептидами для ежедневного ухода.",
    facts: ["Быстро впитывается", "Подходит для применения утром и вечером"]
  },
  productPassport: {
    safeFacts: ["Содержит три пептида"],
    allowedClaims: ["Помогает поддерживать тонус кожи"],
    contentTerritory: { adjacentHelpfulTopics: ["Влияние гаджетов на мимику глаз"] }
  }
};

test("claim contract rejects medical mechanisms invented from an adjacent topic", () => {
  const content = {
    headline: "Лицо устает к обеду",
    subhead: "Три детали ежедневного ухода",
    points: [
      "Гаджеты обезвоживают кожу вокруг глаз",
      "Нарушение микроциркуляции убирается массажем",
      "Легкий крем быстро впитывается"
    ]
  };

  assert.deepEqual(getUnsupportedClaimViolations(content, context), [
    "points[0]:unsupported_effect",
    "points[1]:unsupported_medical_mechanism",
    "points[1]:unsupported_effect"
  ]);
  const repaired = repairUnsupportedClaims(content, context);
  assert.equal(repaired.points[2], "Легкий крем быстро впитывается");
  assert.deepEqual(getUnsupportedClaimViolations(repaired, context), []);
});

test("claim contract permits a risky term when the product explicitly supports it", () => {
  const supported = {
    product: { description: "Средство помогает нормализовать жирность кожи головы." }
  };
  const content = { headline: "Жирность возвращается слишком быстро", points: ["Формула помогает нормализовать жирность кожи головы"] };
  assert.deepEqual(getUnsupportedClaimViolations(content, supported), []);
});

test("claim contract does not mistake ordinary or negative wording for treatment", () => {
  const content = {
    headline: "Скраб не лечит кожу",
    points: ["Откройте упаковку, не привлекая внимания"]
  };
  assert.deepEqual(getUnsupportedClaimViolations(content, {}), []);
});

test("claim contract rejects an unsupported harm claim", () => {
  const content = { headline: "Дезодорант вредит вашей коже", points: ["Проверьте состав"] };
  assert.deepEqual(getUnsupportedClaimViolations(content, { product: { name: "Минеральный дезодорант" } }), ["headline:unsupported_effect"]);
});
