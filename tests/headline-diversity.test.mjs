import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyHeadlineFormula,
  isHeadlineLocked,
  resolveHeadlineFormula
} from "../src/domain/headline-diversity.js";

test("headline diversity keeps why as a valid formula", () => {
  assert.equal(classifyHeadlineFormula("Почему привычка не дает результата"), "curiosity");
  assert.equal(resolveHeadlineFormula({ headline: "Почему привычка не дает результата" }).formula, "curiosity");
});

test("headline diversity rotates a formula after two consecutive uses", () => {
  const result = resolveHeadlineFormula({
    headline: "Почему привычка не дает результата",
    existingJobs: [
      { title: "Почему вечерняя привычка не помогает" },
      { finalContent: { headline: "Почему утро начинается тяжело" } }
    ]
  });

  assert.equal(result.changed, true);
  assert.notEqual(result.formula, "curiosity");
});

test("explicit recent formulas drive rotation when supplied", () => {
  const result = resolveHeadlineFormula({
    headline: "Почему привычка не дает результата",
    recentFormulas: ["Почему вчера было тяжело", "Почему сегодня не легче"]
  });

  assert.equal(result.changed, true);
  assert.equal(result.history.slice(0, 2).join(","), "curiosity,curiosity");
});

test("locked and manual headlines are not rotated", () => {
  assert.equal(isHeadlineLocked({ lockedHeadline: "Почему это происходит" }), true);
  assert.equal(isHeadlineLocked({ generationSource: "manual" }), true);

  const result = resolveHeadlineFormula({
    headline: "Почему это происходит",
    locked: true,
    existingJobs: [{ title: "Почему это происходит" }, { title: "Почему это происходит снова" }]
  });

  assert.equal(result.changed, false);
  assert.equal(result.formula, "curiosity");
});
