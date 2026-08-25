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

test("claim repair never copies typos from the raw product form", () => {
  const typoContext = {
    product: {
      name: "Масло для волос",
      description: "масл жжоба дл сух волс наносит на концы"
    },
    productPassport: {
      plainDescription: "Масло для ухода за сухими кончиками волос",
      safeFacts: ["Наносится на сухие кончики волос"]
    }
  };
  const repaired = repairUnsupportedClaims({
    headline: "Волосы ломаются при расчесывании",
    points: ["Трение — главная причина ломкости"]
  }, typoContext);

  assert.deepEqual(repaired.points, ["Масло для ухода за сухими кончиками волос"]);
  assert.doesNotMatch(repaired.points.join(" "), /жжоба|волс/);
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

test("another supported effect does not authorize an unsupported harm claim", () => {
  const content = { headline: "Обычная паста вредит эмали", points: ["Проверьте состав"] };
  const product = { description: "Ксилит блокирует рост бактерий. Формула защищает эмаль от повреждений." };

  assert.deepEqual(getUnsupportedClaimViolations(content, { product }), ["headline:unsupported_effect"]);
});

test("claim contract rejects invented dental damage mechanisms", () => {
  const content = {
    headline: "Скрип зубов — это микроцарапины",
    points: [
      "Абразивы работают как наждачка и стирают эмаль",
      "Пятна от кофе растворяются без трения"
    ]
  };
  const dentalProduct = { product: { name: "Зубная паста", description: "Паста с папаином для бережного удаления налета" } };

  assert.deepEqual(getUnsupportedClaimViolations(content, dentalProduct), [
    "headline:unsupported_physical_damage",
    "points[0]:unsupported_physical_damage",
    "points[1]:unsupported_physical_damage"
  ]);
  assert.deepEqual(getUnsupportedClaimViolations(repairUnsupportedClaims(content, dentalProduct), dentalProduct), []);
});

test("claim contract rejects invented microdamage and absolute causes", () => {
  const content = {
    headline: "Волосы ломаются при расчесывании",
    points: [
      "Натяжение приводит к микроразрывам кутикулы",
      "Трение — главная причина ломкости"
    ]
  };

  assert.deepEqual(getUnsupportedClaimViolations(content, { product: { name: "Масло для волос" } }), [
    "points[0]:unsupported_physical_damage",
    "points[1]:unsupported_causal_certainty"
  ]);
});

test("claim contract rejects an unsupported body damage metaphor", () => {
  const content = { headline: "Организм ржавеет изнутри", points: ["Добавьте напиток в воду"] };

  assert.deepEqual(getUnsupportedClaimViolations(content, { product: { name: "Жидкий хлорофилл" } }), [
    "headline:unsupported_wellness_mechanism",
    "headline:unsupported_physical_damage"
  ]);
});

test("wellness source claims do not authorize detox and internal deodorant copy", () => {
  const wellness = {
    product: {
      name: "Жидкий хлорофилл",
      description: "Помогает очищать организм от токсинов и нейтрализовать запахи"
    },
    productPassport: { category: "БАД" }
  };
  const content = {
    headline: "Дезодорант не справляется",
    points: [
      "Накопление токсинов напрямую влияет на запах тела",
      "Хлорофилл помогает нейтрализовать запахи изнутри"
    ]
  };

  assert.deepEqual(getUnsupportedClaimViolations(content, wellness), [
    "headline:unsupported_wellness_mechanism",
    "points[0]:unsupported_detox_or_weight",
    "points[0]:unsupported_wellness_mechanism",
    "points[0]:unsupported_causal_certainty",
    "points[1]:unsupported_wellness_mechanism",
    "points[1]:unsupported_effect"
  ]);
});

test("wellness copy cannot disguise internal effects as daily support", () => {
  const wellness = {
    product: { name: "Жидкий хлорофилл" },
    productPassport: { category: "БАД" }
  };
  const content = {
    headline: "Сначала проверь способ применения",
    points: [
      "Организму нужно время для адаптации",
      "Дезодорирующий эффект заметен через две недели",
      "Клеткам нужна поддержка ресурсами каждый день",
      "Продукт содержит натуральный ароматизатор мяты"
    ]
  };

  const repaired = repairUnsupportedClaims(content, wellness);
  assert.deepEqual(getUnsupportedClaimViolations(repaired, wellness), []);
  assert.equal(repaired.points.at(-1), "Продукт содержит натуральный ароматизатор мяты");
});

test("adjacent pet advice cannot invent a physical cause", () => {
  const content = {
    headline: "Кошка стала меньше есть",
    points: [
      "Низкая миска создает лишнюю нагрузку на шею и суставы",
      "Отказ от еды часто связан с физическим дискомфортом"
    ]
  };

  assert.deepEqual(getUnsupportedClaimViolations(content, { product: { name: "Корм для кошек" } }), [
    "points[0]:unsupported_medical_mechanism",
    "points[1]:unsupported_causal_certainty"
  ]);
});

test("pet advice cannot turn a visible change into a nutrient diagnosis", () => {
  const content = {
    headline: "Шерсть стала тусклой",
    points: [
      "Тусклая шерсть часто указывает на дефицит качественного белка",
      "Возрастные изменения требуют качественного белка"
    ]
  };

  assert.deepEqual(getUnsupportedClaimViolations(content, { product: { name: "Корм для кошек" } }), [
    "points[0]:unsupported_causal_certainty",
    "points[1]:unsupported_causal_certainty"
  ]);
});
