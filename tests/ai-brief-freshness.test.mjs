import test from "node:test";
import assert from "node:assert/strict";
import { assessAiBriefFreshness, createRejectedBriefJob } from "../src/domain/ai-brief-freshness.js";

test("ai brief freshness rejects repeated generated themes", () => {
  const result = assessAiBriefFreshness({
    topic: "Почему утренняя вода не бодрит: 3 скрытые ошибки",
    aiPlan: { headline: "Почему утренняя вода не бодрит" }
  }, [{
    title: "Почему утренняя вода не бодрит",
    topic: "Признаки того, что ваш утренний ритуал не работает"
  }]);

  assert.equal(result.ok, false);
  assert.match(result.reasons.join(" "), /повторяет недавнюю тему/);
});

test("ai brief freshness allows a new concrete angle", () => {
  const result = assessAiBriefFreshness({
    topic: "Почему плотный график незаметно ломает вечернее восстановление",
    aiPlan: { headline: "Тело не выключается по команде" }
  }, [{
    title: "Почему утренняя вода не бодрит",
    topic: "Признаки того, что ваш утренний ритуал не работает"
  }]);

  assert.equal(result.ok, true);
});

test("ai brief freshness rejects overused copywriting formulas", () => {
  const result = assessAiBriefFreshness({
    topic: "Миф о волшебной таблетке против ежедневной рутины",
    aiPlan: { headline: "Миф о «волшебной таблетке»" }
  }, []);

  assert.equal(result.ok, false);
  assert.match(result.reasons.join(" "), /шаблонная формула/);
});

test("ai brief freshness rejects another headline starting with why", () => {
  const result = assessAiBriefFreshness({
    topic: "Вечерний уход после тренировки",
    aiPlan: { headline: "Почему волосы путаются после спорта" }
  }, [{ title: "Почему кожа головы быстрее жирнится" }]);

  assert.equal(result.ok, false);
  assert.match(result.reasons.join(" "), /повторяет начало недавнего заголовка: почему/);
});

test("rejected briefs reserve their slot and topic cluster for the next retry", () => {
  const brief = {
    topic: "Ваш крем не работает",
    aiPlan: { headline: "Ваш крем не работает" },
    semanticKey: "expectation-gap",
    contentLayerId: "daily-habit",
    diversitySlot: { id: "expectation-gap", contentLayer: { id: "daily-habit" } },
    topicCluster: { id: "layering", label: "порядок нанесения" }
  };
  const rejected = createRejectedBriefJob(brief, assessAiBriefFreshness(brief, [{ title: "Почему ваш крем не работает" }]));

  assert.equal(rejected.semanticKey, "expectation-gap");
  assert.equal(rejected.contentLayerId, "daily-habit");
  assert.equal(rejected.topicCluster.id, "layering");
});
