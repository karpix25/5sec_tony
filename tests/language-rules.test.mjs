import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { projects, products } from "../src/domain/entities.js";
import { buildImagePrompt } from "../src/domain/generation.js";
import { buildImageRenderPrompt } from "../src/domain/image-render-prompt.js";
import { getProductReferenceTransferInstruction } from "../src/domain/product-reference-transfer.js";
import {
  ensureRussianAvatarVideoPromptGuard,
  ensureRussianImagePromptGuard,
  ensureRussianImageTextRestriction,
  requiredRussianImageTextRule
} from "../src/domain/language-policy.js";
import { createProjectBundle } from "../src/state/project-creation.js";
import { createReferenceEntity, ensureProjectAssets } from "../src/state/factories.js";
import { createStore } from "../src/state/store.js";
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

  assert.match(prompt, /весь редакционный текст инфографики строго на русском языке/);
  assert.match(prompt, /английский интерфейсный или служебный текст запрещен/);
  assert.match(prompt, /Официальные названия брендов и сервисов/);
});

test("avatar video prompt guard prevents English speech and captions", () => {
  const prompt = ensureRussianAvatarVideoPromptGuard("Animate avatar with subtle movement.");

  assert.match(prompt, /ЯЗЫК ФИНАЛЬНОГО РОЛИКА/);
  assert.match(prompt, /английскую речь/);
  assert.match(prompt, /английские субтитры/);
  assert.match(prompt, /только на русском языке/);
  assert.equal(prompt.match(/ЯЗЫК ФИНАЛЬНОГО РОЛИКА/g).length, 1);
});

test("Russian image guard preserves original product package labels", () => {
  const prompt = ensureRussianImagePromptGuard("Нарисуй продукт рядом с русским заголовком.");

  assert.match(prompt, /редакционный текст.*только на русском языке/);
  assert.match(prompt, /ТЕКСТ НА УПАКОВКЕ ИЗ PRODUCT REFERENCE/);
  assert.match(prompt, /не переводить, не локализовать, не переписывать/);
  assert.match(prompt, /скопировать их как часть физического объекта/);
});

test("old Russian image guard is upgraded with package text exception", () => {
  const prompt = ensureRussianImagePromptGuard("ЖЕСТКИЙ ЯЗЫКОВОЙ КОНТРАКТ ДЛЯ ФИНАЛЬНОЙ КАРТИНКИ: весь видимый текст на изображении должен быть только на русском языке.");

  assert.match(prompt, /ТЕКСТ НА УПАКОВКЕ ИЗ PRODUCT REFERENCE/);
  assert.match(prompt, /не переводить, не локализовать, не переписывать/);
});

test("new project settings require Russian final image text", () => {
  const { project } = createProjectBundle({ name: "Тестовый проект" });

  assert.match(project.contentRestrictions, /ЯЗЫК ФИНАЛЬНЫХ КАРТИНОК/);
  assert.match(project.contentRestrictions, /строго на русском языке/);
  assert.match(project.contentRestrictions, /product reference/);
});

test("loaded project settings restore Russian final image text rule", () => {
  const project = ensureProjectAssets({
    id: "project-without-language-rule",
    name: "Старый проект",
    references: [],
    contentRestrictions: "Не обещать гарантированный результат."
  });

  assert.match(project.contentRestrictions, /ЯЗЫК ФИНАЛЬНЫХ КАРТИНОК/);
  assert.match(project.contentRestrictions, /Не обещать гарантированный результат/);
});

test("loaded old project language rule is upgraded with package exception", () => {
  const contentRestrictions = ensureRussianImageTextRestriction("ЯЗЫК ФИНАЛЬНЫХ КАРТИНОК: весь видимый текст должен быть строго на русском языке.");

  assert.match(contentRestrictions, /product reference/);
  assert.match(contentRestrictions, /не переводить и не перерисовывать/);
});

test("project settings save cannot remove Russian final image text rule", () => {
  const store = createStore();
  store.updateProjectSettings({ contentRestrictions: "", restrictions: "Не обещать лечение" });
  const project = store.getState().projects.find((item) => item.id === store.getState().selectedProjectId);

  assert.equal(project.contentRestrictions, requiredRussianImageTextRule);
});

test("creative team image prompt rules preserve product package labels", () => {
  const source = readFileSync(new URL("../scripts/creative-team-prompts.mjs", import.meta.url), "utf8");

  assert.match(source, /Весь редакционный текст инфографики строго на русском/);
  assert.match(source, /уже напечатанные на реальной упаковке из product reference, не переводить и не менять/);
  assert.match(source, /не удаляй логотипы, уже напечатанные на реальной упаковке product reference/);
  assert.doesNotMatch(source, /Весь видимый текст строго на русском/);
});

test("image render prompt preserves product package labels", () => {
  const prompt = buildImageRenderPrompt({
    strategy: { productName: "YOUR GUMMIE", productBridge: "контекст продукта", visualObject: "упаковка" },
    card: { headline: "Проверка", subhead: "Сохраняем упаковку", points: ["Не переводить этикетку"] },
    reference: { title: "упаковка" }
  });

  assert.match(prompt, /весь редакционный текст/);
  assert.match(prompt, /уже напечатанные на реальной упаковке из product reference/);
  assert.doesNotMatch(prompt, /весь видимый текст/);
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

test("product reference text is exempt from Russian localization", () => {
  const project = { ...projects[0], productInFramePercent: 100 };
  const product = {
    ...products[0],
    references: [{
      title: "упаковка",
      promptComment: "реальная банка YOUR GUMMIE KIDS MULTI, сохранить все надписи на этикетке",
      imageData: "https://cdn.example.com/your-gummie.png"
    }]
  };
  const prompt = buildImagePrompt({ project, product, reference: project.references[0] });

  assert.match(prompt, /ИСКЛЮЧЕНИЕ ДЛЯ УПАКОВКИ/);
  assert.match(prompt, /ТЕКСТ НА РЕАЛЬНОЙ УПАКОВКЕ/);
  assert.match(prompt, /не переводить их на русский, не локализовать/);
  assert.match(prompt, /не заменять похожими русскими словами/);
  assert.match(prompt, /YOUR GUMMIE KIDS MULTI/);
});

test("product reference transfer tells image model not to translate package text", () => {
  const instruction = getProductReferenceTransferInstruction({
    remoteProductRefs: 1,
    localProductRefs: 0,
    productVisualMode: "exact-product"
  });

  assert.match(instruction, /ТЕКСТ НА РЕАЛЬНОЙ УПАКОВКЕ/);
  assert.match(instruction, /текст, логотипы и названия, уже напечатанные на упаковке/);
  assert.match(instruction, /не переводить их на русский/);
});

test("image prompt keeps important elements inside social safe zones", () => {
  const project = projects[0];
  const product = products[0];
  const prompt = buildImagePrompt({ project, product, reference: project.references[0] });

  assert.match(prompt, /КОМПОЗИЦИЯ И ОТСТУПЫ/);
  assert.match(prompt, /SAFE ZONE REFERENCE/);
  assert.match(prompt, /1080x1920/);
  assert.match(prompt, /x=150\.\.830/);
  assert.match(prompt, /y=280\.\.1300/);
  assert.match(prompt, /минимум 620px от нижнего края/);
  assert.match(prompt, /x=830\.\.1080/);
  assert.match(prompt, /примерно 250px справа/);
  assert.match(prompt, /y=1344\.\.1920/);
  assert.match(prompt, /Белая область safe-zone маски/);
  assert.match(prompt, /Фиолетовая область safe-zone маски/);
  assert.match(prompt, /Не копируй цвета, прямоугольники, форму маски/);
  assert.match(prompt, /центральных 76-80% ширины/);
  assert.match(prompt, /10-12% пустого поля слева и справа/);
  assert.match(prompt, /верхних 12% кадра/);
  assert.match(prompt, /нижние 22-28% кадра/);
  assert.match(prompt, /Запрещено касание краев/);
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
