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

test("ranking leaderboard contract normalizes short checklist into top chart text", () => {
  const designFormatBrief = {
    formatType: "ranking_leaderboard",
    textContract: { preferredItems: 10 }
  };
  const normalized = normalizeContentScriptForDesignContract({
    designFormatBrief,
    contentScript: {
      headline: "Усталость или сигнал организма?",
      subhead: "5 маркеров, что пора пересмотреть привычки",
      points: ["Кожа стала тусклой", "Энергия падает к 16:00", "Трудности с концентрацией", "Сложно пить воду", "Тяжелый подъем"]
    }
  });

  assert.match(normalized.headline, /^ТОП 10:/);
  assert.doesNotMatch(normalized.subhead, /5 маркеров/i);
  assert.equal(normalized.points.length, 10);
  assert.match(normalized.points[0], /^1: Кожа стала тусклой/);
  assert.match(normalized.points[9], /^10:/);
});

test("ranking leaderboard contract cleans conflicting top headline counts", () => {
  const normalized = normalizeContentScriptForDesignContract({
    designFormatBrief: { formatType: "ranking_leaderboard", textContract: { preferredItems: 12 } },
    contentScript: {
      headline: "ТОП 12: 10 сигналов, что",
      subhead: "Рейтинг микро-состояний",
      points: ["Сон", "Вода", "Свет", "Экран", "Завтрак", "Пауза", "Режим", "Фокус"]
    }
  });

  assert.equal(normalized.headline, "ТОП 12 сигналов");
  assert.equal(normalized.points.length, 12);
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
