import test from "node:test";
import assert from "node:assert/strict";
import { getVisibleTextContractViolations } from "../src/domain/design-text-contract.js";
import { normalizeHumanizedPlan } from "../src/domain/text-humanizer.js";
import { completeCreativeTeamImagePrompt } from "../scripts/creative-team-image-prompt.mjs";
import { parseJsonDraft } from "../scripts/openrouter-response.mjs";

test("humanizer preserves meaning and leaves invalid headlines for contract rejection", () => {
  const duplicate = normalizeHumanizedPlan({ headline: "Шампунь. Шампунь", points: [] }, { headline: "Шампунь. Шампунь", points: [] });
  const incomplete = normalizeHumanizedPlan({ headline: "Кожа скрипит после душа? Это плохой", points: [] }, { headline: "Кожа скрипит после душа? Это плохой", points: [] });
  const long = "Это многофункциональный несмываемый спрей на основе безопасных компонентов для ежедневного ухода";
  const longPlan = normalizeHumanizedPlan({ headline: long, points: [] }, { headline: long, points: [] });

  assert.equal(duplicate.headline, "Шампунь. Шампунь");
  assert.equal(incomplete.headline, "Кожа скрипит после душа? Это плохой");
  assert.equal(longPlan.headline, long);
  assert.deepEqual(getVisibleTextContractViolations({ contentScript: duplicate }), ["headline_duplicate_word"]);
  assert.deepEqual(getVisibleTextContractViolations({ contentScript: incomplete }), ["headline_incomplete"]);
  assert.deepEqual(getVisibleTextContractViolations({ contentScript: longPlan }), ["headline_too_long", "headline_too_many_words"]);
});

test("visible text contract rejects stale-looking headline copy", () => {
  assert.deepEqual(getVisibleTextContractViolations({
    contentScript: {
      headline: "Это многофункциональный несмываемый спрей на основе безопасных компонентов для ежедневного ухода",
      subhead: "Это многофункциональный несмываемый спрей",
      points: []
    }
  }), ["headline_too_long", "headline_too_many_words", "subhead_duplicates_headline"]);
});

test("image prompt package is built from the humanized final headline", async () => {
  const calls = [];
  const draft = await completeCreativeTeamImagePrompt({
    token: "token",
    model: "writer",
    body: { project: {}, product: {} },
    draft: {
      contentScript: { headline: "Шампунь", subhead: "Короткое объяснение", points: ["Первый пункт"] },
      productPassport: {},
      creativeBrief: {},
      visualBrief: {},
      designFormatBrief: {}
    },
    callOpenRouter: async (_token, _model, messages) => {
      calls.push(messages[1].content);
      return JSON.stringify({ imagePromptPackage: { prompt: "FINAL_PACKAGE" } });
    },
    parseJsonDraft
  });

  assert.equal(draft.imagePromptPackage.prompt, "FINAL_PACKAGE");
  assert.equal(calls.length, 1);
  assert.match(calls[0], /Шампунь/);
  assert.doesNotMatch(calls[0], /Шампунь\. Шампунь/);
});
