import test from "node:test";
import assert from "node:assert/strict";
import { generateAudienceExpertDraft } from "../src/services/audience-expert.js";

test("audience expert normalizes arrays into newline separated fields", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      draft: {
        niche: " wellness ",
        keyScenarios: [" сценарий 1 ", "сценарий 2"],
        forbiddenTriggers: [" обещание ", "гарантия "],
        restrictions: [" пункт 1 ", "пункт 2"]
      }
    })
  });

  try {
    const draft = await generateAudienceExpertDraft({ project: {}, draft: {}, products: [] });

    assert.equal(draft.niche, "wellness");
    assert.equal(draft.keyScenarios, "сценарий 1\nсценарий 2");
    assert.equal(draft.forbiddenTriggers, "обещание\nгарантия");
    assert.equal(draft.restrictions, "пункт 1\nпункт 2");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("audience expert normalizes object audience segments into text", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      draft: {
        companyAudience: [
          { segment: "Женщины 25-35", need: "хотят простую бьюти-рутину" },
          { segment: "Мамы", need: "ищут быстрый уход" }
        ]
      }
    })
  });

  try {
    const draft = await generateAudienceExpertDraft({ project: {}, draft: {}, products: [] });

    assert.equal(draft.companyAudience, "Женщины 25-35 — хотят простую бьюти-рутину\nМамы — ищут быстрый уход");
    assert.doesNotMatch(draft.companyAudience, /\[object Object\]/);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("audience expert surfaces plain text backend errors", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false,
    text: async () => "audience backend unavailable"
  });

  try {
    await assert.rejects(
      generateAudienceExpertDraft({ project: {}, draft: {}, products: [] }),
      /audience backend unavailable/
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("audience expert rejects corrupted ai text before it reaches project fields", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      draft: {
        audienceObjections: "Это просто мар��тинг, эффекта не будет"
      }
    })
  });

  try {
    await assert.rejects(
      generateAudienceExpertDraft({ project: {}, draft: {}, products: [] }),
      /битый текст/
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});
