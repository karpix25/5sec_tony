import test from "node:test";
import assert from "node:assert/strict";
import { getDesignTextContractViolations, normalizeContentScriptForDesignContract } from "../src/domain/design-text-contract.js";

test("ranking leaderboard contract detects old checklist text", () => {
  const designFormatBrief = {
    formatType: "ranking_leaderboard",
    textContract: { preferredItems: 10 }
  };
  const contentScript = {
    headline: "Усталость или сигнал организма?",
    subhead: "5 маркеров, что пора пересмотреть привычки",
    points: ["Кожа стала тусклой", "Энергия падает к 16:00", "Трудности с концентрацией", "Сложно пить воду", "Тяжелый подъем"]
  };

  assert.deepEqual(getDesignTextContractViolations({ contentScript, designFormatBrief }), [
    "headline_not_top_chart",
    "subhead_old_count",
    "not_enough_rank_items"
  ]);
});

test("ranking leaderboard contract does not synthesize replacement creative text", () => {
  const designFormatBrief = {
    formatType: "ranking_leaderboard",
    textContract: { preferredItems: 10 }
  };
  const contentScript = {
    headline: "Усталость или сигнал организма?",
    subhead: "5 маркеров, что пора пересмотреть привычки",
    points: ["Кожа стала тусклой", "Энергия падает к 16:00", "Трудности с концентрацией", "Сложно пить воду", "Тяжелый подъем"]
  };
  const normalized = normalizeContentScriptForDesignContract({
    designFormatBrief,
    contentScript
  });

  assert.deepEqual(normalized, contentScript);
});

test("ranking leaderboard contract leaves conflicting headline for ai regeneration", () => {
  const contentScript = {
    headline: "ТОП 12: 10 сигналов, что",
    subhead: "Рейтинг микро-состояний",
    points: ["Сон", "Вода", "Свет", "Экран", "Завтрак", "Пауза", "Режим", "Фокус"]
  };
  const normalized = normalizeContentScriptForDesignContract({
    designFormatBrief: { formatType: "ranking_leaderboard", textContract: { preferredItems: 12 } },
    contentScript
  });

  assert.deepEqual(normalized, contentScript);
});

test("ranking leaderboard contract cleans repeated top headline count", () => {
  const violations = getDesignTextContractViolations({
    designFormatBrief: { formatType: "ranking_leaderboard", textContract: { preferredItems: 12 } },
    contentScript: {
      headline: "ТОП 12: 12 привычек горожанина:",
      subhead: "Рейтинг",
      points: ["Сон", "Вода", "Свет", "Экран", "Завтрак", "Пауза", "Режим", "Фокус", "Вкус", "Комфорт", "Движение", "Ритуал"]
    }
  });

  assert.equal(violations.includes("headline_not_top_chart"), true);
});
