import test from "node:test";
import assert from "node:assert/strict";
import { assessTopicMapQuality, getTopicAlignmentViolations, selectTopicSelection } from "../src/domain/topic-selection.js";

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

test("topic selection does not turn a compactness fact into a bag topic", () => {
  const topic = selectTopicSelection({
    product: { ...pads, description: "Средства гигиены во время менструации в индивидуальной упаковке для сумки" },
    topicMap: {
      topicMap: [
        { id: "bag", theme: "Порядок в сумке", situation: "Вещи теряются среди мелочей", productRelation: "Прокладка в индивидуальной упаковке помещается в сумку" },
        { id: "comfort", theme: "Комфорт в первые дни", situation: "Обычный день требует больше внимания к себе", productRelation: "Тема связана с использованием средств гигиены во время менструации" }
      ]
    },
    random: () => 0
  });

  assert.equal(topic.id, "comfort");
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
    directionId: "",
    fallback: true
  });
});

test("topic selection rejects cosmetic treatment angles before the script stage", () => {
  const showerGel = {
    id: "shower-gel",
    name: "Гель для душа с кислотами",
    description: "Гель для ежедневного очищения кожи тела",
    pains: ["Хочется мягкого очищения после душа"],
    facts: ["Содержит AHA и BHA кислоты"]
  };
  const topic = selectTopicSelection({
    product: showerGel,
    topicMap: {
      topicMap: [
        { id: "pimples", theme: "Прыщи после зала", situation: "После тренировки появляются высыпания", productRelation: "Гель лечит высыпания" },
        { id: "shower", theme: "Мягкое очищение после душа", situation: "Кожа реагирует на слишком агрессивное очищение", productRelation: "Гель помогает сделать ежедневный уход мягче" }
      ]
    },
    random: () => 0
  });

  assert.equal(topic.id, "shower");
});

test("topic map quality asks for a retry when wellness angles are medical", () => {
  const quality = assessTopicMapQuality({
    project: { niche: "БАДы" },
    product: { name: "Жидкий хлорофилл", description: "Добавка для ежедневного ритуала" },
    topicMap: {
      topicMap: [
        { id: "swelling", theme: "Утренние отёки", situation: "Лицо выглядит припухшим", productRelation: "Добавка помогает убрать отёки" },
        { id: "digestion", theme: "Тяжесть после еды", situation: "После ужина нет комфорта", productRelation: "Хлорофилл помогает пищеварению" }
      ]
    }
  });

  assert.equal(quality.needsRetry, true);
  assert.equal(quality.eligible.length, 0);
  assert.match(quality.feedback.join(" "), /Утренние отёки/);
  assert.match(quality.feedback.join(" "), /медицинское или неподтверждённое/);
});

test("topic selection keeps editorial matrix metadata without affecting dedupe", () => {
  const topic = selectTopicSelection({
    product: pads,
    topicMap: { topicMap: [
      {
        id: "choice",
        theme: "Комфорт в первые дни",
        situation: "Обычный день требует больше внимания к себе",
        productRelation: "Тема связана с использованием средств гигиены во время менструации",
        audienceSegment: "женщина перед покупкой",
        awarenessStage: "choice",
        contentGoal: "compare",
        evidenceIds: ["fact-period-use", "fact-material"]
      }
    ] },
    random: () => 0
  });

  assert.equal(topic.audienceSegment, "женщина перед покупкой");
  assert.equal(topic.awarenessStage, "choice");
  assert.equal(topic.contentGoal, "compare");
  assert.deepEqual(topic.evidenceIds, ["fact-period-use", "fact-material"]);
});

test("topic selection rejects candidates outside the selected content direction", () => {
  const topic = selectTopicSelection({
    product: pads,
    contentDirection: { id: "care-habits", title: "Привычки ухода", relation: "Связь с ежедневным уходом." },
    topicMap: { topicMap: [
      { id: "wrong", directionId: "myths", theme: "Мифы о средстве", situation: "Популярный совет не помогает", productRelation: "Тема связана с использованием средства" },
      { id: "right", directionId: "care-habits", theme: "Привычка менять средство вовремя", situation: "Средство заканчивается в самый неудобный момент", productRelation: "Тема помогает выстроить понятный ежедневный уход" }
    ] },
    random: () => 0
  });

  assert.equal(topic.id, "right");
  assert.equal(topic.directionId, "care-habits");
});

test("direct product direction rejects packaging topics", () => {
  const topic = selectTopicSelection({
    product: pads,
    contentDirection: { id: "direct-product", kind: "direct", title: "Сам продукт и его применение" },
    topicMap: {
      topicMap: [
        { id: "package", directionId: "direct-product", theme: "Как проверить упаковку", situation: "Страшно купить подделку", productRelation: "Упаковка помогает проверить товар" },
        { id: "use", directionId: "direct-product", theme: "Как использовать средство", situation: "Нужно пользоваться средством в обычный день", productRelation: "Тема связана с применением продукта" }
      ]
    },
    random: () => 0
  });

  assert.equal(topic.id, "use");
});

test("an explicitly entered custom direction may mention packaging", () => {
  const topic = selectTopicSelection({
    product: pads,
    contentDirection: { id: "custom-proverka-upakovki", kind: "custom", title: "Проверка упаковки" },
    topicMap: {
      topicMap: [{ id: "package", directionId: "custom-proverka-upakovki", theme: "Как проверить упаковку", situation: "Страшно купить подделку", productRelation: "Оператор выбрал тему проверки упаковки" }]
    },
    random: () => 0
  });

  assert.equal(topic.id, "package");
});

test("topic alignment catches a final script that drifted from the selected topic", () => {
  assert.deepEqual(getTopicAlignmentViolations({
    contentDirection: { id: "care-habits" },
    topicSelection: {
      directionId: "care-habits",
      theme: "Привычки ухода",
      situation: "Средство заканчивается в самый неудобный момент",
      productRelation: "Тема помогает выстроить ежедневный уход"
    },
    contentScript: {
      headline: "Скрип: что проверить",
      subhead: "Проверка перед выбором",
      points: ["Посмотрите на упаковку"]
    }
  }), ["content_direction_topic_mismatch", "content_topic_mismatch"]);
});
