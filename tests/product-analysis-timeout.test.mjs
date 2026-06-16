import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("product photo analysis has server and client timeouts", () => {
  const serverSource = readFileSync(new URL("../scripts/openrouter-api.mjs", import.meta.url), "utf8");
  const clientSource = readFileSync(new URL("../src/ui/product-ai.js", import.meta.url), "utf8");

  assert.match(serverSource, /PRODUCT_VISION_TIMEOUT_MS/);
  assert.match(serverSource, /AbortController/);
  assert.match(serverSource, /OpenRouter не ответил/);
  assert.match(clientSource, /productAnalysisTimeoutMs/);
  assert.match(clientSource, /Анализ фото занял слишком много времени/);
});

test("product photo analysis merges ai draft with live form state", () => {
  const renderSource = readFileSync(new URL("../src/ui/render.js", import.meta.url), "utf8");
  const mergeSource = readFileSync(new URL("../src/ui/product-analysis-merge.js", import.meta.url), "utf8");

  assert.match(renderSource, /getLiveProductDraft/);
  assert.match(renderSource, /mergeAnalyzedProductDraft/);
  assert.match(mergeSource, /manualOverrides/);
  assert.match(mergeSource, /initialProduct/);
  assert.match(mergeSource, /liveProduct/);
});
