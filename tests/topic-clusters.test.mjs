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
