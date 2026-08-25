import test from "node:test";
import assert from "node:assert/strict";
import { projects, products } from "../src/domain/entities.js";
import { createContentLayer } from "../src/domain/content-layers.js";

test("content layer uses the least recent option after every layer has history", () => {
  const existingJobs = [
    ["life-pain", "2026-08-24T06:00:00.000Z"],
    ["daily-hack", "2026-08-24T05:00:00.000Z"],
    ["routine-mistake", "2026-08-24T04:00:00.000Z"],
    ["adjacent-topic", "2026-08-24T03:00:00.000Z"],
    ["useful-fact", "2026-08-24T02:00:00.000Z"],
    ["myth-to-life", "2026-08-24T01:00:00.000Z"]
  ].map(([contentLayerId, createdAt]) => ({ contentLayerId, createdAt }));
  const first = createContentLayer({ project: projects[0], product: products[0], existingJobs });
  const second = createContentLayer({
    project: projects[0],
    product: products[0],
    existingJobs: [...existingJobs, { contentLayerId: first.id, createdAt: "2026-08-24T07:00:00.000Z" }]
  });

  assert.equal(first.id, "myth-to-life");
  assert.equal(second.id, "useful-fact");
});

test("ready passport keeps layer subjects clean and product scoped", () => {
  const product = {
    name: "Масло для волос",
    pains: ["несколько кпель на вю длину"],
    aiPassport: {
      version: "product-passport-v2",
      productName: "Масло для волос",
      contentTerritory: {
        productWorld: "уход за волосами",
        habitsAndMistakes: ["Слишком много масла на корнях"],
        directProductTopics: ["Дозировка масла без жирности"],
        adjacentHelpfulTopics: ["Подготовка волос к горячей укладке"]
      }
    }
  };
  const first = createContentLayer({ project: projects[0], product, existingJobs: [] });
  const second = createContentLayer({
    project: projects[0],
    product,
    existingJobs: [{ createdAt: "2026-08-25T01:00:00.000Z", diversitySlot: { contentLayer: { subject: first.subject } } }]
  });

  assert.equal(first.subject, "Слишком много масла на корнях");
  assert.equal(second.subject, "Подготовка волос к горячей укладке");
});
