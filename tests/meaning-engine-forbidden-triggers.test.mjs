import test from "node:test";
import assert from "node:assert/strict";
import { scoreMeaningBrief } from "../src/domain/meaning-engine.js";

test("meaning engine checks forbidden triggers line by line", () => {
  const score = scoreMeaningBrief({
    brief: {
      hook: "Оплату можно обойти в два клика",
      topic: "Сервис обещает обход блокировок",
      visualObject: "экран оплаты"
    },
    project: {
      forbiddenTriggers: "гарантированный результат\nобход блокировок\nобход санкций"
    }
  });

  assert.equal(score.hasRestrictionRisk, true);
  assert.equal(score.score, 1);
});
