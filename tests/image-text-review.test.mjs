import test from "node:test";
import assert from "node:assert/strict";
import { reviewRenderedImageText } from "../src/domain/image-text-contract.js";
import { reviewServerImageText } from "../scripts/server-image-text-review.mjs";
import { handleOpenRouterApi } from "../scripts/openrouter-api.mjs";
import { Readable } from "node:stream";

const contentScript = {
  headline: "Почему закрыть глаза не помогает",
  subhead: "Активный отдых снимает напряжение",
  points: ["Мягкий массаж снимает зажимы", "Тепло помогает расслабиться"]
};

test("rendered image text review detects a corrupted headline", () => {
  const review = reviewRenderedImageText(contentScript, {
    headline: "Почему закрыть а не помогает",
    subhead: contentScript.subhead,
    points: contentScript.points,
    typos: ["а"]
  });

  assert.equal(review.passed, false);
  assert.deepEqual(review.issues, ["headline_mismatch", "rendered_text_errors"]);
});

test("rendered image text review accepts exact Russian copy", () => {
  const review = reviewRenderedImageText(contentScript, contentScript);
  assert.equal(review.passed, true);
  assert.deepEqual(review.issues, []);
});

test("server image text review requests a bounded repair without stopping the job", async () => {
  const record = {
    origin: "http://127.0.0.1:4173",
    job: { prompt: "Исходный промпт", inputUrls: [], inputRefs: [], finalContent: contentScript }
  };
  const patches = [];
  const result = await reviewServerImageText(record, "https://cdn.example.com/bad.png", {
    fetchImpl: async () => ({ ok: true, json: async () => ({ passed: false, issues: ["headline_mismatch"] }) }),
    patchJob: async (patch) => { patches.push(patch); record.job = { ...record.job, ...patch }; }
  });

  assert.equal(result.retry, true);
  assert.equal(patches[0].imageTextReviewAttempts, 1);
  assert.equal(patches[0].inputUrls[0], "https://cdn.example.com/bad.png");
  assert.match(patches[0].prompt, /РЕЖИМ ТОЧЕЧНОГО ИСПРАВЛЕНИЯ ТЕКСТА/);
  assert.match(patches[0].prompt, /Почему закрыть глаза не помогает/);
});

test("server image text review accepts the last image when repair attempts are exhausted", async () => {
  const record = { origin: "http://127.0.0.1:4173", job: { finalContent: contentScript, imageTextReviewAttempts: 2 } };
  const patches = [];
  const result = await reviewServerImageText(record, "https://cdn.example.com/last.png", {
    fetchImpl: async () => ({ ok: true, json: async () => ({ passed: false, issues: ["points_mismatch"] }) }),
    patchJob: async (patch) => patches.push(patch)
  });

  assert.equal(result.retry, false);
  assert.equal(result.exhausted, true);
  assert.match(patches[0].imageTextReviewWarning, /после повторных попыток/);
});

test("image text review endpoint compares OCR output with the exact contract", async () => {
  const previousFetch = globalThis.fetch;
  const previousToken = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "test-token";
  globalThis.fetch = async () => ({
    ok: true,
    text: async () => JSON.stringify({ choices: [{ message: { content: JSON.stringify(contentScript) } }] })
  });
  const request = Readable.from([JSON.stringify({ imageUrl: "https://cdn.example.com/card.png", contentScript })]);
  request.method = "POST";
  const result = {};
  const response = {
    writeHead: (status) => { result.status = status; },
    end: (body) => { result.body = JSON.parse(body); }
  };

  try {
    await handleOpenRouterApi(request, response, new URL("http://127.0.0.1/api/generation/image-text-review"));
    assert.equal(result.status, 200);
    assert.equal(result.body.passed, true);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousToken === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previousToken;
  }
});
