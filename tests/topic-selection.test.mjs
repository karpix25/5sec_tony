import test from "node:test";
import assert from "node:assert/strict";
import { selectTopicSelection } from "../src/domain/topic-selection.js";

const pads = {
  id: "pads",
  name: "Прокладки",
  description: "Средства гигиены во время менструации",
  facts: ["Средства гигиены"],
  aiPassport: { version: "product-passport-v3", productName: "Прокладки", category: "интимная гигиена", coreUseCases: ["использование во время менструации"] }
};

test("topic selection picks a fresh product-related topic", () => {
  const topic = selectTopicSelection({
    product: pads,
    topicMap: {
      topicMap: [
        { id: "period-pain", theme: "Дни, когда трудно собраться", situation: "Обычные дела даются тяжелее", productRelation: "Это знакомая ситуация во время менструации" },
        { id: "period-bag", theme: "Легкая сумка в дороге", situation: "Сборы перед выходом", productRelation: "Прокладки можно положить в сумку" }
      ]
    },
    random: () => 0
  });

  assert.equal(topic.id, "period-pain");
  assert.match(topic.productRelation, /менструац/i);
});

test("topic selection skips a recent duplicate before choosing randomly", () => {
  const topic = selectTopicSelection({
    product: pads,
    existingJobs: [{ title: "Дни, когда все раздражает", topicSelection: { theme: "Дни, когда все раздражает" } }],
    topicMap: {
      topicMap: [
        { id: "repeat", theme: "Дни, когда все раздражает", situation: "Обычные дела даются тяжелее", productRelation: "Это знакомая ситуация во время менструации" },
        { id: "comfort", theme: "Как пережить первый день", situation: "Хочется отменить планы", productRelation: "Это бытовая тема во время менструации" }
      ]
    },
    random: () => 0
  });

  assert.equal(topic.id, "comfort");
});

test("topic selection rejects unsupported claims and always returns a fallback", () => {
  const topic = selectTopicSelection({
    product: pads,
    topicMap: {
      topicMap: [
        { id: "claim", theme: "Средство лечит боль", situation: "Боль проходит сразу", productRelation: "Продукт дает лечебный эффект" }
      ]
    }
  });

  assert.deepEqual(topic, {
    id: "product-context",
    theme: "Прокладки",
    situation: "",
    productRelation: "прямая тема продукта",
    fallback: true
  });
});
