import test from "node:test";
import assert from "node:assert/strict";
import { getVisibleTextContractViolations, repairVisibleTextContract } from "../src/domain/design-text-contract.js";
import { normalizeHumanizedPlan } from "../src/domain/text-humanizer.js";
import { completeCreativeTeamImagePrompt } from "../scripts/creative-team-image-prompt.mjs";
import { parseJsonDraft } from "../scripts/openrouter-response.mjs";

test("humanizer preserves meaning and leaves invalid headlines for contract rejection", () => {
  const duplicate = normalizeHumanizedPlan({ headline: "Шампунь. Шампунь", points: [] }, { headline: "Шампунь. Шампунь", points: [] });
  const incomplete = normalizeHumanizedPlan({ headline: "Кожа скрипит после душа? Это плохой", points: [] }, { headline: "Кожа скрипит после душа? Это плохой", points: [] });
  const long = "Это многофункциональный несмываемый спрей на основе безопасных компонентов для ежедневного ухода";
  const longPlan = normalizeHumanizedPlan({ headline: long, points: [] }, { headline: long, points: [] });

  assert.equal(duplicate.headline, "Шампунь. Шампунь");
  assert.equal(incomplete.headline, "Кожа скрипит после душа? Это плохой");
  assert.equal(longPlan.headline, long);
  assert.deepEqual(getVisibleTextContractViolations({ contentScript: duplicate }), ["headline_too_few_words", "headline_duplicate_word"]);
  assert.deepEqual(getVisibleTextContractViolations({ contentScript: incomplete }), ["headline_too_long", "headline_incomplete"]);
  assert.deepEqual(getVisibleTextContractViolations({ contentScript: longPlan }), ["headline_too_long", "headline_too_many_words", "headline_product_dump", "headline_weak_shell"]);
});

test("visible text contract rejects stale-looking headline copy", () => {
  assert.deepEqual(getVisibleTextContractViolations({
    contentScript: {
      headline: "Это многофункциональный несмываемый спрей на основе безопасных компонентов для ежедневного ухода",
      subhead: "Это многофункциональный несмываемый спрей",
      points: []
    }
  }), ["headline_too_long", "headline_too_many_words", "headline_product_dump", "headline_weak_shell", "subhead_duplicates_headline"]);
});

test("visible text contract rejects a product name instead of a headline", () => {
  const violations = getVisibleTextContractViolations({
    contentScript: { headline: "Хлорофилл с мятой" },
    product: { name: "Жидкий хлорофилл" }
  });

  assert.ok(violations.includes("headline_product_dump"));
  assert.ok(!getVisibleTextContractViolations({
    contentScript: { headline: "Хлорофилл не заменит воду" },
    product: { name: "Жидкий хлорофилл" }
  }).includes("headline_product_dump"));
  assert.ok(getVisibleTextContractViolations({
    contentScript: { headline: "ARSEVA Pro Max" },
    product: { name: "Массажер для ног", aiPassport: { productName: "Массажер для ног ARSEVA Pro Max" } }
  }).includes("headline_product_dump"));
});

test("visible text repair always returns a valid headline", () => {
  const productDump = `5 сигналов, что про ${"полное описание продукта ".repeat(20)}лучше узнать заранее`;
  const repaired = repairVisibleTextContract({
    headline: productDump,
    subhead: productDump,
    points: ["Первый полезный факт", "Купите прямо сейчас"]
  }, { fallbackHeadlines: ["Скрабы не лечат гусиную кожу"] });

  assert.equal(repaired.headline, "Скрабы не лечат гусиную кожу");
  assert.equal(repaired.subhead, "Первый полезный факт");
  assert.deepEqual(repaired.points, ["Первый полезный факт"]);
  assert.deepEqual(getVisibleTextContractViolations({ contentScript: repaired }), []);
});

test("visible text repair has a deterministic last resort", () => {
  const repaired = repairVisibleTextContract({ headline: "Шампунь", points: [] });

  assert.equal(repaired.headline, "Сначала проверь способ применения");
  assert.deepEqual(getVisibleTextContractViolations({ contentScript: repaired }), []);
});

test("visible text repair never clips a numbered product dump into a headline", () => {
  const repaired = repairVisibleTextContract({
    headline: "Заблуждение про 1. снижение веса 2. очищение организма 3. повышение выносливости"
  });

  assert.equal(repaired.headline, "Сначала проверь способ применения");
  assert.deepEqual(getVisibleTextContractViolations({ contentScript: repaired }), []);
});

test("visible text repair takes a natural sentence from the creative hook", () => {
  const repaired = repairVisibleTextContract({
    headline: "Зубная паста укрепляющая; усиленная защита от кариеса"
  }, { fallbackHeadlines: ["Чистишь зубы сразу после кофе? Ты их портишь"] });

  assert.equal(repaired.headline, "Чистишь зубы сразу после кофе");
  assert.deepEqual(getVisibleTextContractViolations({ contentScript: repaired }), []);
});

test("visible text repair shortens a natural point instead of using a generic fallback", () => {
  const repaired = repairVisibleTextContract({
    headline: "Шампунь",
    points: ["Сухие пряди теряют эластичность и легче рвутся при расчесывании"]
  });

  assert.equal(repaired.headline, "Сухие пряди теряют эластичность");
  assert.deepEqual(getVisibleTextContractViolations({ contentScript: repaired }), []);
});

test("visible text repair can build a headline from a structured point", () => {
  const repaired = repairVisibleTextContract({
    headline: "Что важно знать заранее",
    points: [{ title: "Мята меняет", text: "вкус напитка" }]
  });

  assert.equal(repaired.headline, "Мята меняет вкус напитка");
});

test("visible text contract rejects broken numbered headline fragments", () => {
  assert.deepEqual(getVisibleTextContractViolations({
    contentScript: { headline: "Заблуждение про 1. 6." }
  }), ["headline_numbered_fragment"]);
});

test("visible text contract rejects a headline ending with punctuation that promises a continuation", () => {
  assert.ok(getVisibleTextContractViolations({
    contentScript: { headline: "Внешние средства маскируют запах," }
  }).includes("headline_incomplete"));
});

test("visible text contract rejects generic and broken editorial shells", () => {
  for (const headline of ["Почему внешние средства", "Вы их буквально ломаете", "Вы зря тратите свои деньги", "Это ошибка, которая портит эмаль", "Весь секрет в форме частиц", "Подходит для людей с брекетами", "Произведено в России", "Сделано в России", "Исправляем эргономику питания", "Ошибки при сушке феном", "Ошибка в вечерней рутине", "В гигиене подростка", "Не просто увлажнение", "Мягкий вкус мяты", "Натуральный ароматизатор мяты", "Содержит гидроксиапатит и ксилит", "В составе масло ши", "Формула с пантенолом", "С ароматом свежей мяты", "Скрип зубов — не признак чистоты", "Вот что важно знать", "Разбираемся, чего не хватает", "Миф о том, что натуральный состав"]) {
    assert.ok(getVisibleTextContractViolations({ contentScript: { headline } }).includes("headline_weak_shell"));
  }
  assert.ok(getVisibleTextContractViolations({ contentScript: { headline: "Эту деталь легко упустить" } }).includes("headline_weak_shell"));
  assert.ok(getVisibleTextContractViolations({ contentScript: { headline: "Это не норма" } }).includes("headline_weak_shell"));
  assert.ok(getVisibleTextContractViolations({ contentScript: { headline: "Это не работает" } }).includes("headline_weak_shell"));
  assert.ok(getVisibleTextContractViolations({ contentScript: { headline: "Ваш детокс — это просто маркетинг" } }).includes("headline_weak_shell"));
  assert.ok(getVisibleTextContractViolations({ contentScript: { headline: "Скрип кожи — это не чистота" } }).includes("headline_weak_shell"));
  assert.ok(getVisibleTextContractViolations({ contentScript: { headline: "Комфорт в движении" } }).includes("headline_weak_shell"));
});

test("visible text repair capitalizes a lowercase headline", () => {
  const contentScript = { headline: "перекармливание из жалости", points: [] };

  assert.ok(getVisibleTextContractViolations({ contentScript }).includes("headline_lowercase_start"));
  assert.equal(repairVisibleTextContract(contentScript).headline, "Перекармливание из жалости");
});

test("visible text repair removes all-caps shouting", () => {
  const contentScript = { headline: "ПАСТА НЕ ДОЛЖНА ЖЕЧЬ", points: [] };

  assert.ok(getVisibleTextContractViolations({ contentScript }).includes("headline_all_caps"));
  assert.equal(repairVisibleTextContract(contentScript).headline, "Паста не должна жечь");
});

test("visible text contract removes measurement units without a number", () => {
  const contentScript = { headline: "Проверь дозировку заранее", points: ["мг хлорофилла в порции", "500 мг хлорофилла в порции"] };
  assert.ok(getVisibleTextContractViolations({ contentScript }).includes("orphan_measurement"));
  assert.deepEqual(repairVisibleTextContract(contentScript).points, ["500 мг хлорофилла в порции"]);
});

test("visible text contract removes internal production directions", () => {
  const contentScript = {
    headline: "Кошка стала меньше играть",
    points: ["Мало мяса → показываем 61% белка", "Проверьте привычный рацион"]
  };

  assert.ok(getVisibleTextContractViolations({ contentScript }).includes("forbidden_visible_copy"));
  assert.deepEqual(repairVisibleTextContract(contentScript).points, ["Проверьте привычный рацион"]);
});

test("visible text contract rejects filler points and mismatched numbered promises", () => {
  const contentScript = {
    headline: "Пьешь воду через силу? 4 способа",
    points: ["Продукт содержит натуральную мяту", "Смотрите на состав и способ применения"]
  };

  assert.ok(getVisibleTextContractViolations({ contentScript }).includes("headline_count_mismatch"));
  assert.ok(getVisibleTextContractViolations({ contentScript }).includes("generic_point"));
  const repaired = repairVisibleTextContract(contentScript);
  assert.equal(repaired.headline, "Пьешь воду через силу");
  assert.deepEqual(repaired.points, ["Продукт содержит натуральную мяту"]);
  assert.deepEqual(getVisibleTextContractViolations({ contentScript: repaired }), []);
});

test("visible text contract counts promises written as Russian words", () => {
  const contentScript = {
    headline: "Три ошибки в выборе одежды",
    points: ["Первая ошибка", "Вторая ошибка", "Третья ошибка", "Лишний рекламный пункт"]
  };

  assert.ok(getVisibleTextContractViolations({ contentScript }).includes("headline_count_mismatch"));
  assert.notEqual(repairVisibleTextContract(contentScript).headline, contentScript.headline);
});

test("visible text contract rejects clipped and artificial number openings", () => {
  for (const headline of ["ки в сочетании ухода", "Почему 16 лет в лаборатории"]) {
    assert.ok(getVisibleTextContractViolations({ contentScript: { headline } }).includes("headline_broken_start"));
  }
  assert.ok(!getVisibleTextContractViolations({ contentScript: { headline: "С 16 лет меняется уход" } }).includes("headline_broken_start"));
  assert.ok(getVisibleTextContractViolations({ contentScript: { headline: "Уход начинается вечером", subhead: "ек, которые мешают комфорту" } }).includes("broken_line_start"));
});

test("visible text repair prefers a natural fallback over a clipped headline", () => {
  const repaired = repairVisibleTextContract({
    headline: "Почему волосы теряют объем уже через пару часов после мытья"
  }, { fallbackHeadlines: ["Объем исчезает не из-за шампуня"] });

  assert.equal(repaired.headline, "Объем исчезает не из-за шампуня");
});

test("visible text repair never leaves a Russian suffix after removing a list shell", () => {
  const repaired = repairVisibleTextContract({
    headline: "3 признака нехватки влаги в волосах"
  }, { fallbackHeadlines: ["Волосам не хватает влаги"] });

  assert.equal(repaired.headline, "Волосам не хватает влаги");
  assert.doesNotMatch(repaired.headline, /^А нехватки/i);
});

test("image prompt package is built from the humanized final headline", async () => {
  const calls = [];
  const draft = await completeCreativeTeamImagePrompt({
    token: "token",
    model: "writer",
    body: { project: {}, product: {} },
    draft: {
      contentScript: { headline: "Шампунь", subhead: "Короткое объяснение", points: ["Первый пункт"] },
      productPassport: {},
      creativeBrief: {},
      visualBrief: {},
      designFormatBrief: {}
    },
    callOpenRouter: async (_token, _model, messages) => {
      calls.push(messages[1].content);
      return JSON.stringify({ imagePromptPackage: { prompt: "FINAL_PACKAGE" } });
    },
    parseJsonDraft
  });

  assert.equal(draft.imagePromptPackage.prompt, "FINAL_PACKAGE");
  assert.equal(calls.length, 1);
  assert.match(calls[0], /Шампунь/);
  assert.doesNotMatch(calls[0], /Шампунь\. Шампунь/);
});
