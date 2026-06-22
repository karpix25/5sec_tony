import test from "node:test";
import assert from "node:assert/strict";
import { validateCreativeBrief } from "../src/domain/creative-quality-validator.js";

test("creative validator rewards specific curiosity and layout fit", () => {
  const report = validateCreativeBrief({
    draft: {
      sourceHook: "Оказалось, что я (делал что-то) неправильно всю мою жизнь!",
      hook: "Я неправильно пил кофе в Италии",
      topic: "Кофейные привычки в Италии",
      scrollStopperAngle: "Капучино после обеда выдает туриста",
      productFact: "В Италии капучино чаще ассоциируется с утром",
      plan: {
        headline: "Капучино после обеда выдает туриста",
        points: ["В Италии после еды чаще выбирают эспрессо"]
      }
    },
    layoutPlan: { layoutType: "symptoms-poster" },
    hookIntelligence: { sourceHook: "Оказалось, что я (делал что-то) неправильно всю мою жизнь!" },
    existingJobs: []
  });

  assert.ok(report.curiosityScore >= 8);
  assert.equal(report.checks.productSafe, true);
  assert.equal(report.checks.noForbiddenVisible, true);
});

test("creative validator flags product damage, claims, CTA, and vague copy", () => {
  const report = validateCreativeBrief({
    draft: {
      hook: "Хлорофилл не работает, подпишись",
      topic: "регулярность важна",
      plan: {
        headline: "Простая привычка",
        points: ["детокс кожи", "в профиле"]
      }
    },
    project: { name: "БАДы" },
    product: { name: "Хлорофил", forbidden: ["нельзя обещать недоказанный результат"] },
    layoutPlan: { layoutType: "nostalgia-story" },
    hookIntelligence: {},
    existingJobs: []
  });

  assert.equal(report.passed, false);
  assert.equal(report.checks.productSafe, false);
  assert.equal(report.checks.noForbiddenVisible, false);
  assert.equal(report.checks.noRestrictedClaims, false);
  assert.ok(report.warnings.some((item) => /порочить продукт/.test(item)));
});
