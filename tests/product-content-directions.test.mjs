import test from "node:test";
import assert from "node:assert/strict";
import { createContentSlot, createGenerationHistory, createRecentJobDigest } from "../src/domain/content-rotation.js";
import {
  directProductContentDirection,
  getEnabledContentDirections,
  isAdjacentContentDirection,
  normalizeProductContentDirections,
  pickContentDirection,
  preserveContentDirectionSelection
} from "../src/domain/product-content-directions.js";
import { createProductEntity } from "../src/state/factories.js";
import { renderProductSettings } from "../src/ui/product.js";
import { isSafeContentDirection } from "../scripts/ai-memory-api.mjs";

const project = { id: "project-1", projectTheme: "Уход за кожей", references: [] };
const product = {
  id: "product-1",
  projectId: project.id,
  name: "Сыворотка",
  description: "Уход за кожей",
  contentDirections: {
    items: [
      directProductContentDirection,
      { id: "sleep-hygiene", title: "Режим сна", relation: "Связано с восстановлением кожи." },
      { id: "daily-care", title: "Ежедневный уход", relation: "Помогает выстроить понятную рутину." }
    ]
  }
};

test("content directions normalize from saved JSON and keep the direct product lane", () => {
  const directions = normalizeProductContentDirections(JSON.stringify(product.contentDirections));

  assert.deepEqual(directions.items.map((item) => item.id), ["direct-product", "sleep-hygiene", "daily-care"]);
  assert.equal(directions.items[0].kind, "direct");
  assert.deepEqual(getEnabledContentDirections(product).map((item) => item.id), ["direct-product", "sleep-hygiene", "daily-care"]);
  assert.equal(normalizeProductContentDirections(null), null);
});

test("only the direct lane is allowed to show the product", () => {
  assert.equal(isAdjacentContentDirection(directProductContentDirection), false);
  assert.equal(isAdjacentContentDirection({ kind: "adjacent" }), true);
  assert.equal(isAdjacentContentDirection({ kind: "custom" }), true);
});

test("legacy packaging directions are removed from the AI direction set", () => {
  const directions = normalizeProductContentDirections({
    items: [
      directProductContentDirection,
      { id: "quality-standards", title: "Критерии выбора БАД", relation: "Проверка упаковки и документов перед покупкой" },
      { id: "daily-care", title: "Ежедневный уход", relation: "Связано с понятной рутиной." }
    ]
  });

  assert.deepEqual(directions.items.map((item) => item.id), ["direct-product", "daily-care"]);
});

test("direction validation checks the topic title without rejecting its rationale", () => {
  const wellnessProduct = {
    id: "product-wellness",
    projectId: "project-wellness",
    name: "Жидкий хлорофилл",
    description: "Жидкая добавка с мятой"
  };
  const item = {
    id: "smart-shopping",
    title: "Как выбирать качественные добавки",
    relation: "Решает проблему недоверия к качеству товара."
  };

  assert.equal(isSafeContentDirection(item, { project: {}, product: wellnessProduct }), true);
});

test("direction rotation uses the product roughly every third post", () => {
  const direct = pickContentDirection({ product, existingJobs: [] });
  const adjacent = pickContentDirection({
    product,
    existingJobs: [{ productId: product.id, diversitySlot: { contentDirection: direct }, createdAt: "2026-08-26T01:00:00.000Z" }]
  });
  const nextAdjacent = pickContentDirection({
    product,
    existingJobs: [
      { productId: product.id, diversitySlot: { contentDirection: direct }, createdAt: "2026-08-26T01:00:00.000Z" },
      { productId: product.id, diversitySlot: { contentDirection: adjacent }, createdAt: "2026-08-26T02:00:00.000Z" }
    ]
  });
  const nextDirect = pickContentDirection({
    product,
    existingJobs: [
      { productId: product.id, diversitySlot: { contentDirection: direct }, createdAt: "2026-08-26T01:00:00.000Z" },
      { productId: product.id, diversitySlot: { contentDirection: adjacent }, createdAt: "2026-08-26T02:00:00.000Z" },
      { productId: product.id, diversitySlot: { contentDirection: nextAdjacent }, createdAt: "2026-08-26T03:00:00.000Z" }
    ]
  });

  assert.equal(direct.id, "direct-product");
  assert.equal(adjacent.kind, "adjacent");
  assert.equal(nextAdjacent.kind, "adjacent");
  assert.equal(nextDirect.id, "direct-product");
  assert.equal(pickContentDirection({ product, requestedIds: ["daily-care"] }).id, "daily-care");
});

test("refresh keeps operator enabled states and product entities preserve directions", () => {
  const current = normalizeProductContentDirections({
    ...product.contentDirections,
    items: product.contentDirections.items.map((item) => ({ ...item, enabled: item.id !== "sleep-hygiene" }))
  });
  const refreshed = preserveContentDirectionSelection(current, {
    items: [
      { id: "sleep-hygiene", title: "Режим сна", relation: "Обновленное описание" },
      { id: "new-direction", title: "Питание", relation: "Связь с повседневной жизнью" }
    ]
  });
  const entity = createProductEntity(project.id, product.name, { ...product, contentDirections: refreshed });

  assert.equal(refreshed.items.find((item) => item.id === "sleep-hygiene").enabled, false);
  assert.equal(refreshed.items.find((item) => item.id === "new-direction").enabled, true);
  assert.deepEqual(entity.contentDirections.items.map((item) => item.id), ["direct-product", "sleep-hygiene", "new-direction"]);
});

test("custom directions stay in the same rotation pool after an AI refresh", () => {
  const current = normalizeProductContentDirections({
    items: [{ ...directProductContentDirection, enabled: true }],
    customItems: [{ title: "Питание перед тренировкой", enabled: false }]
  });
  const refreshed = preserveContentDirectionSelection(current, {
    items: [{ id: "new-direction", title: "Простые привычки", relation: "Связано с рутиной." }]
  });

  assert.deepEqual(refreshed.customItems.map((item) => item.title), ["Питание перед тренировкой"]);
  assert.equal(refreshed.customItems[0].enabled, false);
  assert.deepEqual(getEnabledContentDirections({ contentDirections: refreshed }).map((item) => item.id), ["direct-product", "new-direction"]);
});

test("product settings show a calculate action for legacy products and checkboxes for configured ones", () => {
  const legacyHtml = renderProductSettings({ product: { ...product, contentDirections: null } });
  const configuredHtml = renderProductSettings({ product });

  assert.match(legacyHtml, /data-refresh-product-directions/);
  assert.match(configuredHtml, /data-content-direction-toggle="sleep-hygiene"/);
  assert.match(configuredHtml, /name="contentDirections"/);
  assert.match(configuredHtml, /data-custom-content-directions/);
});

test("content slot carries the selected direction into generation", () => {
  const slot = createContentSlot({ project, product, existingJobs: [], contentDirectionIds: ["daily-care"] });
  assert.equal(slot.contentDirection.id, "daily-care");
});

test("generation history ignores legacy and other-product jobs for configured products", () => {
  const current = {
    productId: product.id,
    title: "Ежедневный уход без пропусков",
    diversitySlot: { contentDirection: { id: "daily-care" } }
  };
  const history = createGenerationHistory([
    { productId: product.id, title: "Старый заголовок без направления" },
    { title: "Старая задача без продукта" },
    current,
    { productId: "other-product", title: "Другой продукт", diversitySlot: { contentDirection: { id: "daily-care" } } }
  ], { product });

  assert.deepEqual(history, [current]);
  assert.deepEqual(createRecentJobDigest([
    { productId: product.id, title: "Старый заголовок без направления" },
    { title: "Старая задача без продукта" },
    current
  ], { product }), [{
    title: current.title,
    topic: "",
    semanticKey: "",
    meaningPatternId: "",
    format: "",
    contentLayerId: "",
    contentLayerSubject: "",
    contentDirectionId: "daily-care",
    hookType: "",
    attentionFrame: "",
    layoutType: ""
  }]);
});

test("generation history keeps jobs whose direction is stored in topic selection", () => {
  const current = {
    productId: product.id,
    title: "Тема из выбранного направления",
    topicSelection: { directionId: "daily-care", theme: "Тема из выбранного направления" }
  };

  assert.deepEqual(createGenerationHistory([current], { product }), [current]);
  assert.equal(createRecentJobDigest([current], { product })[0].contentDirectionId, "daily-care");
});
