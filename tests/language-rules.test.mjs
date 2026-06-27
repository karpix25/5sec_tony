import test from "node:test";
import assert from "node:assert/strict";
import { projects, products } from "../src/domain/entities.js";
import { buildImagePrompt } from "../src/domain/generation.js";
import { createReferenceEntity } from "../src/state/factories.js";
import { renderDesignSettings } from "../src/ui/design.js";

test("image prompt requires Russian visible text", () => {
  const project = projects[0];
  const product = products[0];
  const prompt = buildImagePrompt({
    project,
    product,
    reference: project.references[0],
    generationBrief: {
      topic: "Subscription payment error",
      hook: "Failed payment can stop access",
      visualObject: "payment dashboard"
    }
  });

  assert.match(prompt, /весь видимый текст строго на русском языке/);
  assert.match(prompt, /английский UI\/text запрещен/);
  assert.match(prompt, /Официальные названия брендов и сервисов/);
});

test("design reference font is fixed for image generations", () => {
  const project = projects[0];
  const product = products[0];
  const reference = createReferenceEntity({
    title: "Газетный постер",
    fontStyle: "узкий жирный гротеск для хука и контрастная антиква для тезиса"
  });
  const prompt = buildImagePrompt({ project, product, reference });

  assert.match(prompt, /ФИКСИРОВАННЫЙ ШРИФТ СТИЛЯ/);
  assert.match(prompt, /узкий жирный гротеск/);
  assert.match(prompt, /Не менять семейство, характер, вес, контраст и обводку/);
});

test("image prompt keeps product contextual instead of forcing package", () => {
  const project = projects[0];
  const product = {
    ...products[0],
    references: [{ title: "Фото продукта", promptComment: "показать банку с синей этикеткой" }]
  };
  const prompt = buildImagePrompt({ project, product, reference: project.references[0] });

  assert.match(prompt, /ПРОДУКТ ПОКАЗЫВАТЬ ПО СМЫСЛУ/);
  assert.match(prompt, /ДЛЯ БЫТОВОЙ ИЛИ ОБРАЗОВАТЕЛЬНОЙ ТЕМЫ/);
  assert.match(prompt, /product reference images.*источник внешнего вида продукта/);
  assert.match(prompt, /ПЛАН ВИЗУАЛИЗАЦИИ ПРОДУКТА: product-absent|ПЛАН ВИЗУАЛИЗАЦИИ ПРОДУКТА: product-present/);
  assert.doesNotMatch(prompt, /Не пихать упаковку в каждую генерацию/);
});

test("image prompt keeps important elements inside social safe zones", () => {
  const project = projects[0];
  const product = products[0];
  const prompt = buildImagePrompt({ project, product, reference: project.references[0] });

  assert.match(prompt, /КОМПОЗИЦИЯ И ОТСТУПЫ/);
  assert.match(prompt, /Reels\/TikTok\/Shorts/);
  assert.match(prompt, /широкие пустые поля/);
  assert.match(prompt, /щедрый отступ.*правого края/);
  assert.match(prompt, /ближе к центру/);
  assert.match(prompt, /Нижняя четверть кадра.*чистой/);
  assert.match(prompt, /смести их в центральную зону кадра/);
  assert.doesNotMatch(prompt, /x=72\.\.820|top UI y=0|right action rail x=820|bottom caption/);
});

test("design reference form asks only for automatic analysis inputs", () => {
  const project = projects[0];
  const html = renderDesignSettings({
    project,
    reference: createReferenceEntity({ title: "Тест", fontStyle: "bold sans" })
  });

  assert.match(html, /name="title"/);
  assert.match(html, /name="imageFile"/);
  assert.doesNotMatch(html, /name="layoutType"|Структура|name="prompt"|Промт|Опишите стиль с нуля|name="fontStyle"|Шрифт \/ типографика стиля|bold sans/);
});
