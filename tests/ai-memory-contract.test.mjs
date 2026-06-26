import test from "node:test";
import assert from "node:assert/strict";
import { normalizeProductAiPassport } from "../src/domain/ai-artifacts.js";
import { createCreativeTeamPayload } from "../src/domain/creative-team-payload.js";
import { createGenerationJob } from "../src/domain/generation.js";

const project = {
  id: "project-ai-memory",
  name: "AI memory",
  productInFramePercent: 100,
  references: [{ id: "design-ref", title: "Design", imageData: "/api/reference-assets/design.png" }],
  ctaOverlay: { enabled: true, x: 50, y: 80, scale: 100 }
};

const product = {
  id: "product-ai-memory",
  projectId: project.id,
  name: "Хлорофилл",
  description: "wellness drink",
  offer: "мягкий ритуал",
  components: "",
  pains: ["трудно пить воду"],
  facts: ["зеленый напиток"],
  forbidden: ["не обещать лечение"],
  aiPassport: {
    productName: "Хлорофилл",
    safeFacts: ["зеленый напиток"],
    forbiddenClaims: ["лечит"],
    visualIdentity: { productLook: "must not survive" }
  },
  references: [{ id: "product-ref", title: "Упаковка", imageData: "/api/reference-assets/product.png" }]
};

const creativeQuality = { curiosityScore: 9, warnings: [], checks: {}, passed: true };

test("product AI passport is semantic and drops visual identity", () => {
  const passport = normalizeProductAiPassport(product.aiPassport);

  assert.equal(passport.productName, "Хлорофилл");
  assert.deepEqual(passport.safeFacts, ["зеленый напиток"]);
  assert.equal(Object.hasOwn(passport, "visualIdentity"), false);
});

test("generation job keeps prompt contract, trace and active product refs together", () => {
  const job = createGenerationJob({
    project,
    product,
    reference: {
      ...project.references[0],
      designAnalysis: {
        formatType: "checklist_cards",
        visualGrammar: { composition: "cards grid", typography: "bold headline" }
      }
    },
    character: { id: "char", isActive: true },
    generationBrief: {
      productPassport: product.aiPassport,
      designFormatBrief: { formatType: "checklist_cards" },
      contentScript: { headline: "Проверь привычку", subhead: "одна строка", points: ["Вода утром"] },
      visualBrief: { productUsage: "exact_product" },
      creativeQuality,
      productVisibilityDecision: {
        productVisualMode: "exact-product",
        shouldPassProductRefs: true,
        reason: "test"
      },
      hookSeed: "Проверь это до покупки"
    },
    existingJobs: []
  });

  assert.equal(job.productVisibilityDecision.shouldPassProductRefs, true);
  assert.equal(job.inputRefs.some((item) => item.role === "product"), true);
  assert.equal(job.inputRefs.some((item) => item.role === "design"), true);
  assert.equal(job.promptContract.textContract.headline, "Проверь привычку");
  assert.equal(job.aiTrace.hookSeed, "Проверь это до покупки");
  assert.equal(job.aiTrace.referencesSent.some((item) => item.role === "product"), true);
});

test("generation job omits product refs when product visibility is inactive", () => {
  const job = createGenerationJob({
    project,
    product,
    reference: project.references[0],
    generationBrief: {
      productVisibilityDecision: {
        productVisualMode: "no-package",
        shouldPassProductRefs: false,
        reason: "test"
      },
      contentScript: { headline: "Без упаковки", points: ["ритуал"] },
      creativeQuality
    },
    existingJobs: []
  });

  assert.equal(job.inputRefs.some((item) => item.role === "product"), false);
  assert.equal(job.promptContract.productVisibilityDecision.shouldPassProductRefs, false);
});

test("creative team payload hides product references when product is inactive", () => {
  const payload = createCreativeTeamPayload({
    project,
    product,
    reference: project.references[0],
    productVisibilityDecision: {
      productVisualMode: "no-package",
      shouldPassProductRefs: false
    }
  });

  assert.deepEqual(payload.product.references, []);
});
