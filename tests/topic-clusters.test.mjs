import test from "node:test";
import assert from "node:assert/strict";
import { createTopicClusterPlan } from "../src/domain/topic-clusters.js";
import { generateServerAiBrief } from "../scripts/generation-brief-service.mjs";

function createTravelProduct() {
  return {
    id: "crosspay",
    name: "Плати по миру бот в тг",
    description: "Рекомендации для туристов в разных странах",
    facts: ["О достопримечательностях, культурных особенностях, необычных фактах о странах"],
    components: "поддержка, проверка сценария, сопровождение оплаты",
    aiPassport: {
      productName: "Плати по миру",
      plainDescription: "Цифровой помощник для путешественников",
      safeFacts: [
        "Культурные особенности и традиции стран",
        "Общеизвестные туристические достопримечательности",
        "Правила этикета и дресс-кода",
        "Географические и климатические особенности регионов"
      ],
      coreUseCases: [
        "Получение информации о способах оплаты услуг в конкретной стране",
        "Изучение культурных особенностей и правил поведения",
        "Поиск лайфхаков для экономии времени и денег в поездке"
      ],
      painSituations: [
        "Невозможность оплатить товары привычными картами",
        "Страх попасть в неловкую ситуацию из-за незнания местных обычаев"
      ],
      contentTerritory: {
        directProductTopics: ["Туристические лайфхаки", "Культурный код стран", "Подготовка к поездке"],
        adjacentHelpfulTopics: ["Транспортная логистика", "Гастрономические гиды", "Цифровизация в туризме"],
        unsafeTopics: ["Политические дискуссии"]
      }
    }
  };
}

test("topic cluster planner avoids an overused payment cluster", () => {
  const product = createTravelProduct();
  const existingJobs = [
    { title: "Ваша карта может подвести", topic: "Скрытые ошибки при оплате в путешествиях" },
    { title: "Карта не универсальный ключ", topic: "Миф об универсальности банковских карт" },
    { title: "Где карта бесполезна", topic: "Оплата и локальные платежные системы" }
  ];

  const plan = createTopicClusterPlan({ product, existingJobs });

  assert.ok(plan.available.some((cluster) => cluster.id === "payment-services" && cluster.cooldown));
  assert.notEqual(plan.selected.id, "payment-services");
  assert.match(plan.selected.label, /культур|этикет|транспорт|гастро|подготов|турист|цифров|достопримеч/i);
});

test("same product category follows each product-scoped brand passport", () => {
  const createProduct = (productWorld, directProductTopics, adjacentHelpfulTopics) => ({
    id: "shampoo",
    name: "Шампунь",
    aiPassport: {
      version: "product-passport-v2",
      productName: "Шампунь",
      contentTerritory: {
        productWorld,
        directProductTopics,
        adjacentHelpfulTopics
      }
    }
  });
  const volumeBrand = createTopicClusterPlan({
    project: { keyScenarios: "кожа головы реагирует на частое мытье" },
    product: createProduct("объем волос и стойкость укладки", ["почему укладка быстро теряет объем"], ["укладка и ежедневный уход"])
  });
  const sensitiveBrand = createTopicClusterPlan({
    project: { keyScenarios: "укладка быстро теряет объем" },
    product: createProduct("комфорт чувствительной кожи головы", ["дискомфорт после частого мытья"], ["мягкий уход за кожей головы"])
  });

  assert.match(volumeBrand.selected.label, /укладка|объем/i);
  assert.match(sensitiveBrand.selected.label, /кож[а-яё]*\s+голов|дискомфорт/i);
  assert.notEqual(volumeBrand.selected.id, sensitiveBrand.selected.id);
});

test("ready product passport ignores stale project scenarios from a sibling product", () => {
  const plan = createTopicClusterPlan({
    project: { keyScenarios: "Говядина — кормление собаки", audiencePains: "Собака стала вялой" },
    product: {
      id: "cat-food",
      name: "Корм для кошек",
      aiPassport: {
        version: "product-passport-v2",
        productName: "Корм для кошек 7+",
        contentTerritory: {
          productWorld: "уход за возрастной кошкой",
          directProductTopics: ["питание кошки после 7 лет"],
          adjacentHelpfulTopics: ["как заметить снижение активности кошки"]
        }
      }
    }
  });

  assert.doesNotMatch(plan.available.map((cluster) => cluster.label).join(" "), /собак|говядин/i);
  assert.match(plan.selected.label, /кошк/i);
});

test("product evidence about packaging does not become an automatic content topic", () => {
  const plan = createTopicClusterPlan({
    project: { projectTheme: "здоровые пищевые привычки" },
    product: {
      name: "Жидкий хлорофилл",
      description: "напиток с мятой",
      aiPassport: {
        version: "product-passport-v2",
        productName: "Жидкий хлорофилл",
        category: "нутрицевтик",
        safeFacts: ["Упаковка оснащена защитной мембраной"],
        coreUseCases: ["утренний ритуал с водой"],
        contentTerritory: {
          productWorld: "ежедневные wellness-привычки",
          directProductTopics: ["качество упаковки и документы", "вкус и ежедневный ритуал"],
          adjacentHelpfulTopics: ["водный баланс"]
        }
      }
    }
  });

  const text = plan.available.map((cluster) => `${cluster.label} ${cluster.description}`).join(" ");
  assert.doesNotMatch(text, /упаков|мембран|документ/i);
  assert.match(text, /ритуал|водн|wellness/i);
});

test("wellness clusters exclude detox and body-mechanism topics", () => {
  const plan = createTopicClusterPlan({
    product: {
      id: "chlorophyll",
      name: "Жидкий хлорофилл",
      aiPassport: {
        version: "product-passport-v2",
        productName: "Жидкий хлорофилл",
        category: "БАД",
        contentTerritory: {
          productWorld: "культура внутренней чистоты организма",
          habitsAndMistakes: ["привычка добавлять напиток в воду"],
          directProductTopics: ["механизмы детоксикации организма", "роль мяты во вкусе напитка"],
          adjacentHelpfulTopics: ["связь микробиома и кожи", "водный баланс в течение дня"]
        }
      }
    }
  });

  const text = plan.available.map((cluster) => cluster.label).join(" ");
  assert.doesNotMatch(text, /детокс|организм|микробиом|кож/i);
  assert.match(text, /мят|водн|напит/i);
});

test("non-travel products never receive travel topic clusters", () => {
  const plan = createTopicClusterPlan({
    project: { projectTheme: "уход за кожей тела" },
    product: {
      id: "body-gel",
      name: "Гель для душа с кислотами",
      aiPassport: {
        contentTerritory: {
          productWorld: "ритуал ухода за кожей",
          adjacentHelpfulTopics: ["способ применения кислот", "привычки после душа"]
        }
      }
    }
  });

  assert.ok(plan.available.length > 0);
  assert.ok(plan.available.every((cluster) => !clusterRulesForTest.has(cluster.id)));
});

const clusterRulesForTest = new Set([
  "payment-services", "culture-etiquette", "local-habits", "sights-routes", "transport-logistics",
  "food-gastro", "climate-season", "trip-prep", "digital-travel", "info-noise"
]);

test("same product does not reuse its last topic cluster", () => {
  const product = createTravelProduct();
  const first = createTopicClusterPlan({ product });
  const staleJobs = Array.from({ length: 12 }, (_, index) => ({
    productId: `other-${index}`,
    title: "Старая тема",
    createdAt: `2026-08-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`
  }));
  const second = createTopicClusterPlan({
    product,
    existingJobs: [
      ...staleJobs,
      { productId: product.id, topicCluster: { label: first.selected.label }, createdAt: "2026-08-24T00:00:00.000Z" }
    ]
  });

  assert.notEqual(second.selected.id, first.selected.id);
  assert.equal(second.available.find((cluster) => cluster.id === first.selected.id).cooldown, true);
});

test("shared category words do not put every product cluster on cooldown", () => {
  const product = {
    id: "hair-oil",
    name: "Масло для волос",
    aiPassport: {
      version: "product-passport-v2",
      productName: "Масло для волос",
      contentTerritory: {
        productWorld: "осознанный уход за волосами",
        directProductTopics: ["дозировка масла без жирности"],
        adjacentHelpfulTopics: [
          "основы правильного расчесывания для предотвращения ломкости",
          "подготовка волос к горячей укладке"
        ]
      }
    }
  };
  const first = createTopicClusterPlan({ product });
  const second = createTopicClusterPlan({
    product,
    existingJobs: [{
      productId: product.id,
      title: "Расчесывание без лишнего натяжения",
      topic: "Основы правильного расчесывания для предотвращения ломкости",
      topicCluster: first.selected,
      createdAt: "2026-08-25T01:00:00.000Z"
    }]
  });

  assert.notEqual(second.selected.id, first.selected.id);
  assert.ok(second.available.some((cluster) => !cluster.cooldown));
});

test("server brief sends selected topic cluster to the ai departments", async () => {
  const previousFetch = globalThis.fetch;
  const bodies = [];
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    bodies.push(body);
    return {
      ok: true,
      json: async () => ({
        draft: {
          topicCluster: body.topicCluster,
          topicClusterPlan: body.topicClusterPlan,
          creativeBrief: { topic: `Тема внутри кластера: ${body.topicCluster.label}`, formatIntent: "checklist" },
          hook: "Хук внутри выбранного кластера",
          contentScript: { headline: "Кластер выбран", subhead: "", points: ["Пункт"] }
        }
      })
    };
  };

  try {
    const product = createTravelProduct();
    const brief = await generateServerAiBrief({
      origin: "http://127.0.0.1:4173",
      project: { id: "ppm", name: "Плати по миру", projectTheme: "Рекомендации и лайфхаки о туризме" },
      product,
      reference: { id: "ref", type: "design", title: "Travel poster", designAnalysis: { formatType: "checklist_cards" } },
      existingJobs: [
        { title: "Ваша карта может подвести", topic: "Скрытые ошибки при оплате в путешествиях" },
        { title: "Карта не универсальный ключ", topic: "Миф об универсальности банковских карт" }
      ],
      hookLibrary: { activeVersionId: "", versions: [] }
    });

    assert.equal(bodies.length, 1);
    assert.ok(bodies[0].topicCluster);
    assert.notEqual(bodies[0].topicCluster.id, "payment-services");
    assert.equal(brief.topicCluster.id, bodies[0].topicCluster.id);
    assert.match(brief.topic, /Тема внутри кластера/);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("server brief keeps the topic cluster reserved by its batch", async () => {
  const previousFetch = globalThis.fetch;
  const product = createTravelProduct();
  const reservedCluster = createTopicClusterPlan({ product }).available[2];
  let sentCluster = null;
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    sentCluster = body.topicCluster;
    return {
      ok: true,
      json: async () => ({
        draft: {
          topicCluster: body.topicCluster,
          creativeBrief: { topic: body.topicCluster.label, formatIntent: "checklist" },
          hook: "Короткий заголовок для теста",
          contentScript: { headline: "Короткий заголовок для теста", subhead: "", points: ["Пункт"] }
        }
      })
    };
  };

  try {
    const brief = await generateServerAiBrief({
      origin: "http://127.0.0.1:4173",
      project: { id: "ppm", projectTheme: "Рекомендации о туризме" },
      product,
      reference: { id: "ref", type: "design" },
      existingJobs: [],
      diversitySlot: { id: "reserved-slot", topicCluster: reservedCluster }
    });

    assert.equal(sentCluster.id, reservedCluster.id);
    assert.equal(brief.topicCluster.id, reservedCluster.id);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
