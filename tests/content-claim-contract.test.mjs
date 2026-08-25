import test from "node:test";
import assert from "node:assert/strict";
import { getClaimEvidence, getUnsupportedClaimViolations, repairUnsupportedClaims } from "../src/domain/content-claim-contract.js";

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
  assert.ok(repaired.points.includes("Легкий крем быстро впитывается"));
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

test("cosmetic copy cannot personify a product as stealing comfort", () => {
  const content = { headline: "Ваш крем крадет комфорт летом", points: [] };
  assert.deepEqual(getUnsupportedClaimViolations(content, { product: { name: "Крем для лица" } }), ["headline:unsupported_effect"]);
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

test("claim contract rejects violent dental hooks and invented friction", () => {
  const content = {
    headline: "Брекеты: как не убить эмаль",
    points: ["Абразивные пасты создают лишнее трение у металла"]
  };

  assert.deepEqual(getUnsupportedClaimViolations(content, { product: { name: "Зубная паста" } }), [
    "headline:unsupported_physical_damage",
    "points[0]:unsupported_physical_damage"
  ]);
});

test("dental products cannot invent systemic microbiome effects", () => {
  const dentalContext = {
    product: {
      name: "Зубная паста для брекетов",
      description: "Паста с гидроксиапатитом и ксилитом"
    }
  };
  const content = {
    headline: "Микробы во рту влияют на тело",
    subhead: "Чистка меняет ваше самочувствие",
    points: [
      "Рот — главные ворота для бактерий",
      "Паста снижает бактериальную нагрузку"
    ]
  };

  const violations = getUnsupportedClaimViolations(content, dentalContext);
  assert.ok(violations.includes("headline:unsupported_disease_or_pathogen"));
  assert.ok(violations.includes("subhead:unsupported_wellness_mechanism"));
  assert.ok(violations.includes("points[0]:unsupported_disease_or_pathogen"));
  assert.ok(violations.includes("points[1]:unsupported_disease_or_pathogen"));
  assert.deepEqual(getUnsupportedClaimViolations(repairUnsupportedClaims(content, dentalContext), dentalContext), []);
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

test("cosmetic advice cannot invent mechanisms for external factors", () => {
  const hairContext = {
    product: { name: "Масло для волос", description: "Масло для ухода за длиной волос" }
  };
  const content = {
    headline: "Волосы как проволока? Дело в воде",
    points: [
      "Жесткая вода вымывает липиды и делает волосы сухими",
      "Жесткость воды провоцирует пушистость"
    ]
  };

  const violations = getUnsupportedClaimViolations(content, hairContext);
  assert.ok(violations.includes("headline:unsupported_causal_certainty"));
  assert.ok(violations.includes("points[0]:unsupported_external_causal_mechanism"));
  assert.ok(violations.includes("points[1]:unsupported_external_causal_mechanism"));
});

test("cosmetic copy cannot assert an unsupported cause with iz-za", () => {
  const content = { headline: "Из-за воды в кране", points: [] };
  assert.deepEqual(getUnsupportedClaimViolations(content, { product: { name: "Масло для волос" } }), ["headline:unsupported_causal_certainty"]);
});

test("claim contract rejects invented skin explanations and product forms", () => {
  const cosmetic = { product: { name: "Сыворотка для лица", description: "Сыворотка с гиалуроновой кислотой" } };
  const content = {
    headline: "Кожа не стареет, а хочет пить",
    points: [
      "Стянутость означает, что защитный барьер ослаблен",
      "Гиалурону нужна влага, чтобы работать",
      "Крем идеально ложится и не скатывается"
    ]
  };
  const violations = getUnsupportedClaimViolations(content, cosmetic);
  assert.ok(violations.includes("headline:unsupported_skin_mechanism"));
  assert.ok(violations.includes("points[0]:unsupported_skin_mechanism"));
  assert.ok(violations.includes("points[1]:unsupported_skin_mechanism"));
  assert.ok(violations.includes("points[2]:unsupported_cosmetic_effect"));

  assert.deepEqual(getUnsupportedClaimViolations({
    headline: "Таблетки могут не работать",
    points: ["Жидкий концентрат комфортно усваивается"]
  }, { product: { name: "Жидкий хлорофилл" } }), [
    "headline:unsupported_product_form",
    "points[0]:unsupported_wellness_mechanism",
    "points[0]:unsupported_product_form"
  ]);
});

test("claim contract rejects invented quantified comparisons", () => {
  assert.deepEqual(getUnsupportedClaimViolations({
    headline: "Твоя сумочка не резиновая",
    points: ["Прокладки занимают в три раза меньше места"]
  }, { product: { name: "Ультратонкие прокладки" } }), ["points[0]:unsupported_quantified_comparison"]);
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

test("wellness evidence excludes unsafe source promises before prompting", () => {
  const evidence = getClaimEvidence({
    product: {
      name: "Жидкий хлорофилл",
      description: "Хлорофилл с натуральным ароматизатором мяты",
      offer: ["Помогает контролировать аппетит", "Способствует улучшению самочувствия", "Произведено в России"]
    },
    productPassport: { category: "БАД" }
  });

  assert.deepEqual(evidence, ["Жидкий хлорофилл", "Хлорофилл с натуральным ароматизатором мяты", "Произведено в России"]);
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
      "Хлорофилл поддерживает работу ЖКТ и внутреннее состояние",
      "Продукт содержит натуральный ароматизатор мяты"
    ]
  };

  const repaired = repairUnsupportedClaims(content, wellness);
  assert.deepEqual(getUnsupportedClaimViolations(repaired, wellness), []);
  assert.equal(repaired.points.at(-1), "Продукт содержит натуральный ароматизатор мяты");
});

test("wellness copy cannot revive digestion and internal freshness angles", () => {
  const wellness = {
    product: { name: "Жидкий хлорофилл" },
    productPassport: { category: "БАД" }
  };
  const content = {
    headline: "Внешние средства маскируют запах",
    points: [
      "Тяжесть после еды и вздутие говорят, что пищеварению нужна поддержка",
      "Хлорофилл помогает поддерживать свежесть изнутри"
    ]
  };

  const violations = getUnsupportedClaimViolations(content, wellness);
  assert.ok(violations.includes("headline:unsupported_wellness_mechanism"));
  assert.ok(violations.includes("points[0]:unsupported_wellness_mechanism"));
  assert.ok(violations.includes("points[1]:unsupported_wellness_mechanism"));
});

test("claim repair skips packaging and certificates for a non-operational product", () => {
  const context = {
    product: { name: "Жидкий хлорофилл" },
    productPassport: {
      category: "БАД",
      safeFacts: [
        "Упаковка оснащена защитной термомембраной",
        "Продукт имеет СГР, выданное в РФ",
        "Продукт содержит натуральный ароматизатор мяты"
      ]
    }
  };
  const repaired = repairUnsupportedClaims({
    headline: "Свежесть изнутри",
    points: ["Хлорофилл поддерживает работу ЖКТ"]
  }, context);

  assert.deepEqual(repaired.points, ["Продукт содержит натуральный ароматизатор мяты"]);
});

test("claim repair drops unsafe points instead of inserting editorial filler", () => {
  const repaired = repairUnsupportedClaims({
    headline: "Четыре обещания про добавку",
    points: ["Хлорофилл очищает организм", "Хлорофилл повышает энергию"]
  }, {
    product: { name: "Жидкий хлорофилл" },
    productPassport: { category: "БАД" }
  });

  assert.deepEqual(repaired.points, []);
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

test("pet advice cannot invent a calorie rule from lower activity", () => {
  const content = {
    headline: "Комфорт возрастной кошки",
    points: ["Меньше движения — значит, нужно меньше калорий в порции"]
  };

  assert.deepEqual(getUnsupportedClaimViolations(content, {
    product: { name: "Корм для возрастных кошек", description: "Полнорационный сухой корм" }
  }), ["points[0]:unsupported_invented_diet_advice"]);
});

test("massage devices cannot invent muscle diagnoses or therapeutic effects", () => {
  const massageContext = {
    product: {
      name: "Массажер для стоп",
      description: "Роликовый массажер с мягким подогревом"
    }
  };
  const content = {
    headline: "Мышцы не отдыхают",
    points: [
      "Ролики мягко снимают зажимы",
      "Подогрев помогает мышцам быстрее расслабиться",
      "15 минут превращают вечер в эффективное восстановление"
    ]
  };

  assert.deepEqual(getUnsupportedClaimViolations(content, massageContext), [
    "headline:unsupported_therapeutic_effect",
    "points[0]:unsupported_therapeutic_effect",
    "points[1]:unsupported_therapeutic_effect",
    "points[2]:unsupported_therapeutic_effect"
  ]);
  assert.deepEqual(getUnsupportedClaimViolations(repairUnsupportedClaims(content, massageContext), massageContext), []);
});

test("massage devices cannot invent pain and protective spasms from misuse", () => {
  const massageContext = { product: { name: "Перкуссионный массажер" } };
  const content = {
    headline: "Превращают расслабление в пытку",
    points: [
      "Воздействие на костные выступы вызывает резкую боль",
      "Максимальная скорость провоцирует защитный спазм",
      "Жесткая насадка на чувствительной шее создает дискомфорт"
    ]
  };

  const violations = getUnsupportedClaimViolations(content, massageContext);
  assert.equal(violations.filter((item) => item.includes("unsupported_device_misuse_harm")).length, 3);
});

test("cosmetics cannot invent skin diagnoses or treatment advice", () => {
  const cosmeticContext = {
    product: {
      name: "Минеральный дезодорант",
      description: "Спрей с ароматом ванили и мяты"
    }
  };
  const content = {
    headline: "Кожа горит после депиляции",
    subhead: "Как убрать раздражение и вернуть комфорт",
    points: [
      "Скраб в день бритья травмирует кожу",
      "Спирт вызывает жжение",
      "Отдушки провоцируют аллергию",
      "Игнорирование зуда ведет к воспалению",
      "Спрей мягко успокаивает кожу"
    ]
  };

  const violations = getUnsupportedClaimViolations(content, cosmeticContext);
  assert.ok(violations.includes("headline:unsupported_skin_harm_or_treatment"));
  assert.ok(violations.includes("subhead:unsupported_skin_harm_or_treatment"));
  assert.ok(violations.includes("points[0]:unsupported_skin_harm_or_treatment"));
  assert.ok(violations.includes("points[1]:unsupported_skin_harm_or_treatment"));
  assert.ok(violations.includes("points[2]:unsupported_skin_harm_or_treatment"));
  assert.ok(violations.includes("points[3]:unsupported_skin_harm_or_treatment"));
  assert.ok(violations.includes("points[4]:unsupported_skin_harm_or_treatment"));
  assert.deepEqual(getUnsupportedClaimViolations(repairUnsupportedClaims(content, cosmeticContext), cosmeticContext), []);
});

test("cosmetics cannot invent a numeric replacement comparison", () => {
  const cosmeticContext = {
    product: {
      name: "Минеральный дезодорант",
      description: "Универсальный спрей с алунитом"
    }
  };
  const content = {
    headline: "Один флакон вместо пяти",
    subhead: "Спрей заменяет гору косметики",
    points: ["Подходит для нескольких бытовых сценариев"]
  };

  assert.deepEqual(getUnsupportedClaimViolations(content, cosmeticContext), [
    "headline:unsupported_invented_comparison",
    "subhead:unsupported_invented_comparison"
  ]);
});
