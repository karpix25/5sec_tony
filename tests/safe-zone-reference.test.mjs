import test from "node:test";
import assert from "node:assert/strict";
import { projects } from "../src/domain/entities.js";
import { createGenerationJob, getGenerationInputReferences } from "../src/domain/generation.js";

const tinyPng = "data:image/png;base64,iVBORw0KGgo=";

test("generation input references keep design primary and safe-zone last", () => {
  const refs = getGenerationInputReferences({
    reference: { title: "Стиль", imageData: tinyPng },
    product: { references: [{ title: "Упаковка", imageData: tinyPng }] }
  });

  assert.equal(refs.at(-1).role, "safe_zone");
  assert.equal(refs.at(-1).title, "Safe zone placement mask");
  assert.match(refs.at(-1).url, /^data:image\/png;base64,/);
  assert.deepEqual(refs.map((item) => item.role), ["design", "product", "safe_zone"]);
});

test("molekular product generation sends safe-zone mask and prompt contract", () => {
  const project = projects[0];
  const reference = { ...project.references[0], imageData: tinyPng };
  const product = {
    id: "molekular-shampoo",
    projectId: project.id,
    name: "Molekular шампунь",
    description: "Шампунь Molekular для ухода за волосами.",
    offer: "мягкий уход без агрессивных обещаний",
    components: "кератин, мягкие ПАВ",
    pains: ["волосы выглядят сухими", "укладка быстро теряет форму"],
    facts: ["кератин визуально поддерживает гладкость полотна волос"],
    forbidden: ["не обещать лечение выпадения волос"],
    references: [{ title: "Molekular упаковка", imageData: tinyPng, promptComment: "белая бутылка шампуня Molekular" }]
  };

  const job = createGenerationJob({
    project,
    product,
    reference,
    character: project.characters[0],
    generationBrief: {
      topic: "Почему кератин быстро смывается",
      hook: "Кератин смывается не сразу",
      visualObject: "бутылка Molekular и схема волоса",
      productVisibilityDecision: { productVisualMode: "exact-product", shouldPassProductRefs: true, reason: "molekular smoke" }
    }
  });

  assert.deepEqual(job.inputRefs.map((item) => item.role), ["design", "product", "safe_zone"]);
  assert.equal(job.inputUrls.length, 3);
  assert.match(job.prompt, /SAFE ZONE REFERENCE/);
  assert.match(job.prompt, /Белая область safe-zone маски/);
  assert.match(job.prompt, /RECREATE DESIGN REFERENCE INSIDE SAFE-ZONE/);
  assert.doesNotMatch(job.prompt, /safe_zone важнее|приоритет всегда у safe-zone/i);
  assert.equal(job.promptContract.referencePriority.safe_zone, "placement_mask_only_last_reference");
  assert.equal(job.promptContract.inputRefs.some((item) => item.role === "safe_zone"), true);
  assert.equal(job.inputRefs.find((item) => item.role === "product")?.title, "Molekular упаковка");
});
