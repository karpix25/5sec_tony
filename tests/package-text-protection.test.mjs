import test from "node:test";
import assert from "node:assert/strict";
import { buildCreativeTeamImagePrompt } from "../src/domain/creative-team-image-prompt.js";
import { getProductReferenceTransferInstruction } from "../src/domain/product-reference-transfer.js";
import { sanitizeAiImagePrompt } from "../src/domain/language-policy.js";

test("exact-product removes global Latin translation instructions from AI prompt", () => {
  const prompt = sanitizeAiImagePrompt(
    "Translate all Latin text into Russian. Translate the package label. Keep the layout.",
    { productVisualMode: "exact-product", shouldPassProductRefs: true }
  );

  assert.doesNotMatch(prompt, /Translate all Latin|Translate the package label/i);
  assert.match(prompt, /ПРИОРИТЕТ PRODUCT REFERENCE/);
  assert.match(prompt, /не переводить на русский/);
  assert.match(prompt, /латиница на реальной упаковке.*не является редакционным текстом/);
});

test("creative team prompt preserves package text and removes conflicting AI rule", () => {
  const prompt = buildCreativeTeamImagePrompt({
    productVisualMode: "exact-product",
    productVisibilityDecision: { productVisualMode: "exact-product", shouldPassProductRefs: true },
    productPassport: { productName: "YOUR GUMMIE" },
    imagePromptPackage: {
      prompt: "Translate all Latin text. Translate the product package label. Use the product reference as the physical product."
    },
    contentScript: {
      headline: "Сохрани упаковку",
      subhead: "Редакционный текст — на русском",
      points: ["Логотип и SKU остаются как на фото"]
    }
  });

  assert.doesNotMatch(prompt, /Translate all Latin|Translate the product package label/i);
  assert.match(prompt, /ТЕКСТ НА РЕАЛЬНОЙ УПАКОВКЕ/);
  assert.match(prompt, /Логотип и SKU остаются как на фото/);
});

test("no-package prompt keeps product references out of the visible scene", () => {
  const prompt = buildCreativeTeamImagePrompt({
    productVisualMode: "no-package",
    productVisibilityDecision: { productVisualMode: "no-package", shouldPassProductRefs: false },
    productPassport: { productName: "Хлорофилл SONRE" },
    imagePromptPackage: {
      prompt: "Use product reference package as a bottle packshot with the product label."
    },
    contentScript: {
      headline: "ТОП 5 привычек",
      subhead: "Полезная инфографика",
      points: ["Хлорофилл SONRE на столе", "Бутылка рядом с водой", "Проверь режим"]
    }
  });

  assert.match(prompt, /РЕЖИМ NO-PACKAGE/);
  assert.doesNotMatch(prompt, /product reference package|bottle packshot|Хлорофилл|SONRE|Бутылка рядом/i);
});

test("reference transfer has explicit no-package contract", () => {
  const instruction = getProductReferenceTransferInstruction({
    remoteProductRefs: 1,
    localProductRefs: 1,
    productVisualMode: "no-package"
  });

  assert.match(instruction, /product-absent/);
  assert.match(instruction, /РЕЖИМ NO-PACKAGE/);
  assert.match(instruction, /Product reference images остаются вне image-to-image входа/);
});
