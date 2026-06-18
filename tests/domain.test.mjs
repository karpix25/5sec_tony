import test from "node:test";
import assert from "node:assert/strict";
import { noAvatarCharacterId } from "../src/domain/avatar-selection.js";
import { projects, products } from "../src/domain/entities.js";
import {
  advanceJob,
  buildImagePrompt,
  createAutoGenerationBrief,
  createSemanticPlan,
  createGenerationJob,
  getLimitState,
  getProductsForProject
} from "../src/domain/generation.js";
import { ensureProjectAssets } from "../src/state/factories.js";
import { createStore } from "../src/state/store.js";

test("products are scoped by project", () => {
  const scoped = getProductsForProject(products, "supplements");
  assert.deepEqual(scoped.map((product) => product.id), ["magnesium", "collagen"]);
});

test("store keeps only design references selectable for generation", () => {
  const store = createStore();
  const state = store.getState();
  const project = state.projects.find((item) => item.id === state.selectedProjectId);

  assert.ok(project.references.length);
  assert.equal(project.references.some((reference) => reference.type === "cta"), false);
  assert.equal(project.references.some((reference) => reference.id === "cta-default"), false);
  assert.ok(project.references.some((reference) => reference.id === state.selectedReferenceId));
});

test("image prompt separates design reference style from product content", () => {
  const project = projects[0];
  const product = products[0];
  const prompt = buildImagePrompt({
    project,
    product,
    reference: project.references[0],
    character: { ...project.characters[0], name: "Имя Не Писать" },
    generationBrief: {
      topic: "7 признаков проблем с кишечником",
      hook: "Проблемы с кишечником",
      pointCount: "7",
      visualObject: "3D кишечник"
    },
    freePrompt: "проверить текст до генерации"
  });

  assert.match(prompt, /GPT Image 2/);
  assert.match(prompt, /Дизайн-референс использовать только как визуальный стиль/);
  assert.match(prompt, /ТЕХНИЧЕСКАЯ SAFE ZONE/);
  assert.match(prompt, /Не добавлять аватара/);
  assert.match(prompt, /не копировать его текст, смысл/);
  assert.match(prompt, /Дополнительная визуальная инструкция к копированию дизайна/);
  assert.match(prompt, /Смыслы и формулировки создать только на основе компании/);
  assert.ok(prompt.includes(project.references[0].title));
  assert.doesNotMatch(prompt, new RegExp(project.style.slice(0, 12)));
  assert.match(prompt, new RegExp(product.name));
  assert.match(prompt, /Проблемы с кишечником/);
  assert.match(prompt, /Запрещено обещать/);
  assert.doesNotMatch(prompt, /Имя Не Писать/);
  assert.doesNotMatch(prompt, /Дисклеймер: лечит бессонницу/);
});

test("generation job starts as queued and advances through pipeline", () => {
  const project = projects[0];
  const product = products[0];
  const job = createGenerationJob({
    project,
    product,
    reference: { ...project.references[0], imageData: "data:image/png;base64,style" },
    character: { ...project.characters[0], imageData: "https://cdn.example.com/avatar.png" },
    freePrompt: ""
  });
  const next = advanceJob(job);

  assert.equal(job.status, "queued");
  assert.equal(job.characterId, project.characters[0].id);
  assert.deepEqual(job.inputUrls, ["data:image/png;base64,style"]);
  assert.deepEqual(job.inputRefs, [{ role: "design", title: project.references[0].title, isLocalData: true }]);
  assert.equal(next.status, "running");
  assert.equal(next.stage, "prompt");
});

test("generation brief is auto-created from project and product context", () => {
  const project = {
    ...projects[2],
    projectTheme: "Оплата зарубежных сервисов для россиян",
    keyScenarios: "Сервис не принимает российскую карту\nНужно оплатить подписку"
  };
  const product = products.find((item) => item.projectId === "ppm");
  const brief = createAutoGenerationBrief({
    project,
    product,
    reference: project.references[0],
    generationBrief: {}
  });

  assert.match(brief.topic, /карт|зарубежн|подписк/);
  assert.match(brief.hook, /зарубеж|оплат|карта|подписк/i);
  assert.doesNotMatch(brief.topic, /кишечник/i);
  assert.ok(brief.compositionMode?.id);
});

test("auto generation rotates hooks and topics by existing project jobs", () => {
  const project = {
    ...projects[2],
    projectTheme: "Оплата зарубежных сервисов для россиян",
    niche: "финтех / трансграничные платежи",
    keyScenarios: "Сервис не принимает российскую карту\nНужно оплатить подписку\nНужна бронь за рубежом"
  };
  const product = products.find((item) => item.projectId === "ppm");
  const first = createGenerationJob({ project, product, reference: project.references[0], character: project.characters[0], existingJobs: [] });
  const second = createGenerationJob({ project, product, reference: project.references[0], character: project.characters[0], existingJobs: [first] });

  assert.notEqual(first.title, second.title);
  assert.notEqual(first.topic, second.topic);
  assert.notEqual(first.semanticKey, second.semanticKey);
});

test("payment generation rotates semantic plans, not only headlines", () => {
  const project = {
    ...projects[2],
    projectTheme: "Оплата зарубежных сервисов для россиян",
    niche: "финтех / трансграничные платежи"
  };
  const product = products.find((item) => item.projectId === "ppm");
  const first = createGenerationJob({ project, product, reference: project.references[0], character: project.characters[0], existingJobs: [] });
  const second = createGenerationJob({ project, product, reference: project.references[0], character: project.characters[0], existingJobs: [first] });
  const firstPlan = createSemanticPlan({ project, product, brief: createAutoGenerationBrief({ project, product, reference: project.references[0], generationBrief: first, existingJobs: [] }) });
  const secondPlan = createSemanticPlan({ project, product, brief: createAutoGenerationBrief({ project, product, reference: project.references[0], generationBrief: second, existingJobs: [first] }) });

  assert.notEqual(first.semanticKey, second.semanticKey);
  assert.notDeepEqual(firstPlan.points, secondPlan.points);
  assert.notEqual(firstPlan.subhead, secondPlan.subhead);
});

test("payment invoice and support scenarios keep different content logic", () => {
  const project = {
    ...projects[2],
    projectTheme: "Оплата зарубежных сервисов для россиян",
    niche: "финтех / трансграничные платежи"
  };
  const product = products.find((item) => item.projectId === "ppm");
  const invoicePlan = createSemanticPlan({
    project,
    product,
    brief: { hook: "Счет из-за рубежа", semanticKey: "invoice-payment", pointCount: "5" }
  });
  const supportPlan = createSemanticPlan({
    project,
    product,
    brief: { hook: "Платеж завис", semanticKey: "support-route", pointCount: "5" }
  });
  const termsPlan = createSemanticPlan({
    project,
    product,
    brief: { hook: "Сначала условия", semanticKey: "commission-terms", pointCount: "5" }
  });
  const boundariesPlan = createSemanticPlan({
    project,
    product,
    brief: { hook: "Красные флаги", semanticKey: "safe-boundaries", pointCount: "5" }
  });

  assert.match(invoicePlan.subhead, /счет/i);
  assert.match(invoicePlan.points.join(" "), /Получатель|Валюта|Срок|Назначение/);
  assert.match(supportPlan.subhead, /статусы заявки/);
  assert.match(supportPlan.points.join(" "), /Заявка|проверка|уточнения|Статус/);
  assert.match(termsPlan.points.join(" "), /Итоговая сумма|Комиссия|Документ/);
  assert.match(boundariesPlan.points.join(" "), /Нормально|Опасно/);
  assert.match(createSemanticPlan({ project, product, brief: { hook: "Карта не прошла", semanticKey: "card-rejected", pointCount: "5" } }).points.join(" "), /отклоняет|сгореть|хаос/);
  assert.notDeepEqual(invoicePlan.points, supportPlan.points);
  assert.notDeepEqual(termsPlan.points, boundariesPlan.points);
});

test("image prompt includes a coherent semantic plan for payment projects", () => {
  const project = {
    ...projects[2],
    projectTheme: "Оплата зарубежных сервисов для россиян",
    niche: "финтех / трансграничные платежи"
  };
  const product = products.find((item) => item.projectId === "ppm");
  const brief = createAutoGenerationBrief({ project, product, reference: project.references[0], generationBrief: {} });
  const plan = createSemanticPlan({ project, product, brief });
  const prompt = buildImagePrompt({
    project,
    product,
    reference: project.references[0],
    character: project.characters[0],
    generationBrief: brief,
    freePrompt: ""
  });

  assert.match(plan.subhead, /ломается|отключают|останавливается|не будет ждать/);
  assert.match(plan.points.join(" "), /отклоняет|сгореть|хаос|доступ/);
  assert.match(plan.disclaimer, /условий платежа/);
  assert.match(prompt, /СМЫСЛОВОЙ ПЛАН/);
  assert.match(prompt, /Не добавляй неуказанные проценты/);
});

test("limit state reports remaining quota", () => {
  const limit = getLimitState({ dailyLimit: 30, usedToday: 18, projectLimit: 100, usedTotal: 92 });
  assert.equal(limit.remaining, 8);
  assert.equal(limit.percent, 92);
  assert.equal(limit.isNearLimit, true);
  assert.equal(limit.daily.remaining, 12);
  assert.equal(limit.total.remaining, 8);
});

test("store creates a project with a starter product", () => {
  const store = createStore();
  store.createProject({ name: "Новый проект", productName: "Новый продукт" });
  const state = store.getState();
  const project = state.projects.find((item) => item.name === "Новый проект");
  const product = state.products.find((item) => item.projectId === project.id);

  assert.equal(state.selectedProjectId, project.id);
  assert.equal(product.name, "Новый продукт");
  assert.equal(project.exportFolder, "Yandex Disk / 5сек / Новый проект");
  assert.equal(project.yandexDiskFolder, "disk:/ВИДЕО/5сек/Новый проект");
});

test("store deletes project with related products and jobs", () => {
  const store = createStore();
  store.createProject({ name: "Удаляемый", productName: "Тест" });
  const created = store.getState().projects.find((item) => item.name === "Удаляемый");
  store.createJob();
  store.deleteProject(created.id);
  const state = store.getState();

  assert.equal(state.projects.some((item) => item.id === created.id), false);
  assert.equal(state.products.some((item) => item.projectId === created.id), false);
  assert.equal(state.jobs.some((item) => item.projectId === created.id), false);
});

test("store updates project settings and uses them in prompt", () => {
  const store = createStore();
  store.updateProjectSettings({
    name: "Wellness проект",
    keyScenarios: "Срочная ситуация\nОшибка пользователя",
    companyInfo: "Компания производит премиальные wellness-продукты",
    companyAudience: "Покупатели 30-45, ценят честный состав",
    toneOfVoice: "заботливый экспертный",
    restrictions: "не обещать лечение"
  });
  const state = store.getState();
  const project = state.projects.find((item) => item.id === state.selectedProjectId);
  const product = state.products.find((item) => item.id === state.selectedProductId);
  const prompt = buildImagePrompt({
    project,
    product,
    reference: project.references[0],
    character: project.characters[0],
    freePrompt: ""
  });

  assert.equal(project.companyInfo, "Компания производит премиальные wellness-продукты");
  assert.equal(project.name, "Wellness проект");
  assert.equal(project.toneOfVoice, "заботливый экспертный");
  assert.match(prompt, /Компания производит/);
  assert.match(prompt, /Покупатели 30-45/);
  assert.match(prompt, /Сценарные кластеры/);
  assert.match(prompt, /не обещать лечение/);
  assert.match(prompt, /Визуальный стиль брать из выбранного дизайн-референса/);
});

test("store migrates legacy Yandex Disk folder paths to video root", () => {
  const project = ensureProjectAssets({
    ...projects[0],
    exportFolder: "Yandex Disk / Anton / БАДы / Готовые",
    yandexDiskFolder: "Yandex Disk / Anton / БАДы / Готовые"
  });

  assert.equal(project.exportFolder, "Yandex Disk / 5сек / БАДы");
  assert.equal(project.yandexDiskFolder, "disk:/ВИДЕО/5сек/БАДы");
});

test("store generates project strategy fields from current project context", () => {
  const store = createStore();
  store.generateProjectField("niche", {
    companyInfo: "Бренд wellness-продуктов",
    companyAudience: "Женщины 30+, хотят понятную поддержку самочувствия"
  });
  const state = store.getState();
  const project = state.projects.find((item) => item.id === state.selectedProjectId);
  const product = state.products.find((item) => item.id === state.selectedProductId);
  const prompt = buildImagePrompt({
    project,
    product,
    reference: project.references[0],
    character: project.characters[0],
    generationBrief: state.generationBrief,
    freePrompt: ""
  });

  assert.match(project.niche, /wellness|нутрицевтика/);
  assert.match(prompt, /Ниша:/);
});

test("project strategy prioritizes current project theme over old product context", () => {
  const store = createStore();
  store.generateProjectField("niche", {
    projectTheme: "Сервис для россиян, который позволяет оплачивать зарубежные сервисы рублями и платить за рубежом",
    companyInfo: "",
    companyAudience: ""
  });
  const project = store.getState().projects.find((item) => item.id === store.getState().selectedProjectId);

  assert.match(project.niche, /финтех|платеж|зарубежных сервисов/);
});

test("store updates product content and generation brief for prompt assembly", () => {
  const store = createStore();
  store.updateProduct({
    name: "Инозитол 1500 мг",
    description: "Продукт для wellness-рутины без медицинских обещаний",
    offer: "курс для ежедневной поддержки привычек",
    components: "инозитол 1500 мг",
    pains: "тяга к сладкому\nнестабильный режим",
    facts: "акцент на регулярность\nне заменяет врача",
    forbidden: "лечит гормоны\nгарантирует похудение"
  });
  store.updateGenerationBrief({
    topic: "Самая рабочая схема похудения",
    hook: "Схема похудения",
    format: "scheme",
    pointCount: "3",
    visualObject: "бутылочки продукта слева и силуэт тела справа",
    cta: "Подобрать курс",
    salesLevel: "expert",
    notes: "Использовать премиальную подачу без лишнего шума"
  });
  const state = store.getState();
  const project = state.projects.find((item) => item.id === state.selectedProjectId);
  const product = state.products.find((item) => item.id === state.selectedProductId);
  const prompt = buildImagePrompt({
    project,
    product,
    reference: project.references[0],
    character: project.characters[0],
    generationBrief: state.generationBrief,
    freePrompt: ""
  });

  assert.deepEqual(product.pains, ["тяга к сладкому", "нестабильный режим"]);
  assert.match(prompt, /Самая рабочая схема похудения/);
  assert.match(prompt, /бутылочки продукта слева/);
  assert.match(prompt, /инозитол 1500 мг/);
  assert.match(prompt, /лечит гормоны/);
  assert.match(prompt, /CTA: не добавлять на изображение/);
  assert.doesNotMatch(prompt, /Подобрать курс/);
});

test("generation job keeps explicit no-avatar selection", () => {
  const project = projects[0];
  const product = products.find((item) => item.projectId === project.id);
  const job = createGenerationJob({
    project,
    product,
    reference: project.references[0],
    character: null
  });

  assert.equal(job.characterId, noAvatarCharacterId);
});

test("product save keeps generation brief intact for current product session", () => {
  const store = createStore();
  store.updateGenerationBrief({
    topic: "7 признаков проблем с кишечником",
    hook: "Проблемы с кишечником",
    visualObject: "3D кишечник"
  });
  store.updateProduct({
    name: "Коллаген БАД",
    description: "Beauty-комплекс для ежедневной рутины",
    offer: "поддержка регулярной beauty-рутины",
    components: "коллаген, витамин C",
    pains: "ломкость ногтей\nтусклая кожа",
    facts: "акцент на регулярность\nбез обещаний омоложения",
    forbidden: "гарантирует омоложение"
  });

  const state = store.getState();
  const job = store.createJob();

  assert.equal(state.generationBrief.topic, "7 признаков проблем с кишечником");
  assert.match(job.topic, /кишечник/i);
  assert.match(job.prompt, /Коллаген БАД/);
});

test("product switching keeps current generation brief until operator changes it", () => {
  const store = createStore();
  store.updateGenerationBrief({
    topic: "Как не бросить вечерний ритуал",
    hook: "Вечерний ритуал без срывов",
    visualObject: "стакан воды и мягкий вечерний свет"
  });
  store.createProduct({ name: "Второй продукт" });

  const nextProductId = store.getState().selectedProductId;
  store.selectProduct(nextProductId);

  assert.equal(store.getState().generationBrief.topic, "Как не бросить вечерний ритуал");
  assert.equal(store.getState().generationBrief.hook, "Вечерний ритуал без срывов");
});

test("store creates and deletes product inside selected project", () => {
  const store = createStore();
  const projectId = store.getState().selectedProjectId;
  store.createProduct({ name: "Тестовый продукт" });
  const created = store.getState().products.find((item) => item.name === "Тестовый продукт");
  store.deleteProduct(created.id);
  const state = store.getState();

  assert.equal(created.projectId, projectId);
  assert.equal(state.products.some((item) => item.id === created.id), false);
});

test("store does not delete the last product in project and explains why", () => {
  const store = createStore();
  store.createProject({ name: "Solo project" });
  const stateBefore = store.getState();
  const lastProductId = stateBefore.selectedProductId;
  const result = store.deleteProduct(lastProductId);
  const stateAfter = store.getState();

  assert.deepEqual(result, { ok: false, reason: "last-product" });
  assert.equal(stateAfter.products.some((item) => item.id === lastProductId), true);
});

test("store manages product-level references and adds them to prompt", () => {
  const store = createStore();
  store.createProductReference({
    title: "Упаковка крупно",
    promptComment: "взять ракурс упаковки и зеленый фон",
    imageName: "pack.png"
  });
  let state = store.getState();
  let product = state.products.find((item) => item.id === state.selectedProductId);
  const productReference = product.references.find((item) => item.title === "Упаковка крупно");
  const project = state.projects.find((item) => item.id === state.selectedProjectId);
  const prompt = buildImagePrompt({
    project,
    product,
    reference: project.references[0],
    character: project.characters[0],
    freePrompt: ""
  });

  assert.match(prompt, /Референсы продукта/);
  assert.match(prompt, /зеленый фон/);

  store.deleteProductReference(productReference.id);
  state = store.getState();
  product = state.products.find((item) => item.id === state.selectedProductId);
  assert.equal(product.references.some((item) => item.id === productReference.id), false);
});


test("store manages global audio library", () => {
  const store = createStore();
  store.createAudio({ title: "QA audio", mood: "энергично", duration: "5 sec" });
  const created = store.getState().audioLibrary.find((audio) => audio.title === "QA audio");

  store.deleteAudio(created.id);

  assert.equal(Boolean(created), true);
  assert.equal(store.getState().audioLibrary.some((audio) => audio.id === created.id), false);
});

test("store uploads multiple audio files with dates and deletes every audio", () => {
  const store = createStore();
  store.createAudioFiles([
    { title: "Track one", fileName: "track-one.mp3", fileType: "audio/mpeg", createdAt: "2026-06-09T10:00:00.000Z" },
    { title: "Track two", fileName: "track-two.wav", fileType: "audio/wav", createdAt: "2026-06-09T11:00:00.000Z" }
  ]);

  const uploaded = store.getState().audioLibrary.filter((audio) => audio.fileName.startsWith("track-"));

  assert.equal(uploaded.length, 2);
  assert.equal(uploaded.every((audio) => Boolean(audio.createdAt)), true);

  store.getState().audioLibrary.forEach((audio) => store.deleteAudio(audio.id));

  assert.equal(store.getState().audioLibrary.length, 0);
  assert.equal(store.getState().selectedAudioId, undefined);
});
