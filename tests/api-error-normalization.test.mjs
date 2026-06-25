import test from "node:test";
import assert from "node:assert/strict";
import { generateAiBrief } from "../src/services/brief-ai.js";
import { extractHooksFromImage } from "../src/services/hook-ai.js";
import { humanizeGenerationPlan } from "../src/services/text-humanizer.js";

test("brief service surfaces plain-text API errors", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, text: async () => "brief backend unavailable" });
  try {
    await assert.rejects(
      generateAiBrief({ project: {}, product: {}, reference: {}, existingJobs: [] }),
      /brief backend unavailable/
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("brief service sends hook library and active design reference context", async () => {
  const previousFetch = globalThis.fetch;
  let requestBody = null;
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return { ok: true, json: async () => ({ draft: { topic: "Тема", hook: "Хук" } }) };
  };
  try {
    await generateAiBrief({
      project: {},
      product: {},
      reference: { id: "viral-pink-symptoms", title: "Viral symptoms poster", textDensity: "high" },
      existingJobs: [{ title: "Старый", contentLayerId: "life-pain", diversitySlot: { contentLayer: { subject: "сон" } } }],
      hookLibrary: {
        activeVersionId: "v1",
        versions: [{ id: "v1", status: "active", hooks: [{ id: "h1", text: "Оказалось, я делал это неправильно", enabled: true }] }]
      }
    });

    assert.equal(requestBody.hookLibrary.hooks[0].text, "Оказалось, я делал это неправильно");
    assert.equal(requestBody.activeDesignReference.title, "Viral symptoms poster");
    assert.equal(requestBody.layoutContentPlan.layoutType, "symptoms-poster");
    assert.equal(requestBody.existingJobs[0].contentLayerId, "life-pain");
    assert.equal(requestBody.existingJobs[0].contentLayerSubject, "сон");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("brief service retries stale ai topics before accepting a fresh brief", async () => {
  const previousFetch = globalThis.fetch;
  const bodies = [];
  const drafts = [
    { topic: "Почему утренняя вода не бодрит", hook: "Вода утром не всегда работает" },
    { topic: "Миф о волшебной таблетке", hook: "БАД не решает рутину сам" },
    { topic: "Почему вечерняя усталость начинается еще днем", hook: "Силы заканчиваются раньше вечера" }
  ];
  globalThis.fetch = async (_url, options) => {
    bodies.push(JSON.parse(options.body));
    return { ok: true, json: async () => ({ draft: drafts[bodies.length - 1] }) };
  };

  try {
    const brief = await generateAiBrief({
      project: {},
      product: {},
      reference: {},
      existingJobs: [{ title: "Почему утренняя вода не бодрит", topic: "утренний ритуал" }]
    });

    assert.equal(brief.topic, "Почему вечерняя усталость начинается еще днем");
    assert.equal(bodies.length, 3);
    assert.match(bodies[1].existingJobs.at(-1).title, /ОТКЛОНЕНО/);
    assert.match(bodies[2].existingJobs.at(-1).topic, /шаблонная формула/);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("brief service strips base64 images from creative team payload", async () => {
  const previousFetch = globalThis.fetch;
  let requestBody = null;
  let uploadBody = null;
  const dataUrl = `data:image/png;base64,${"a".repeat(2000)}`;
  globalThis.fetch = async (url, options) => {
    if (String(url).includes("/api/reference-assets")) {
      uploadBody = JSON.parse(options.body);
      return { ok: true, json: async () => ({ url: "/api/reference-assets/ref-uploaded" }) };
    }
    requestBody = JSON.parse(options.body);
    return { ok: true, json: async () => ({ draft: { topic: "Тема", hook: "Хук" } }) };
  };
  try {
    await generateAiBrief({
      project: { id: "p1", references: [{ id: "r1", title: "Чарт", imageData: dataUrl }] },
      product: { id: "prod1", references: [{ title: "Фото", imageData: dataUrl }] },
      reference: { id: "r1", title: "Чарт", imageData: dataUrl },
      existingJobs: []
    });

    const payload = JSON.stringify(requestBody);
    assert.match(uploadBody.imageData, /data:image\/png;base64/);
    assert.doesNotMatch(payload, /data:image\/png;base64/);
    assert.equal(requestBody.reference.imageData, undefined);
    assert.equal(requestBody.reference.imageUrl, "/api/reference-assets/ref-uploaded");
    assert.equal(requestBody.reference.hasImage, true);
    assert.equal(requestBody.product.references[0].imageData, undefined);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("hook service surfaces plain-text API errors", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, text: async () => "hooks backend unavailable" });
  try {
    await assert.rejects(
      extractHooksFromImage({ imageData: "data:image/png;base64,abc", title: "Hooks" }),
      /hooks backend unavailable/
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("humanizer service surfaces invalid-json API errors", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, text: async () => "<html>502 upstream broken</html>" });
  try {
    await assert.rejects(
      humanizeGenerationPlan({ project: {}, product: {}, brief: {}, plan: {} }),
      /502 upstream broken/
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});
