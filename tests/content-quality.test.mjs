import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { projects, products } from "../src/domain/entities.js";
import { createAutoGenerationBrief, createGenerationJob, createSemanticPlan } from "../src/domain/generation.js";
import { createContentLayer } from "../src/domain/content-layers.js";
import { normalizeHumanizedPlan } from "../src/domain/text-humanizer.js";

test("semantic fallback raises life pain before product solution", () => {
  const project = {
    ...projects[0],
    projectTheme: "сон, стресс и ежедневное восстановление",
    keyScenarios: "человек просыпается разбитым\nвечером не может расслабиться"
  };
  const product = products.find((item) => item.id === "magnesium");
  const brief = createAutoGenerationBrief({ project, product, reference: project.references[0] });
  const plan = createSemanticPlan({ project, product, brief });
  const text = `${plan.subhead} ${plan.points.join(" ")}`.toLowerCase();

  assert.match(text, /в жизни|ситуац|полезн|привычк|факт|следующий шаг/);
  assert.doesNotMatch(text, /проверьте, что именно известно|действуйте только|вывод делайте/);
});

test("ai brief instructions demand shareable life facts", () => {
  const source = readFileSync(new URL("../scripts/openrouter-api.mjs", import.meta.url), "utf8");

  assert.match(source, /интересный факт или жизненное наблюдение/);
  assert.match(source, /сохраню или отправлю другу/);
  assert.match(source, /сначала подними боль/);
  assert.match(source, /Работай в несколько слоев/);
  assert.match(source, /Тема не обязана напрямую повторять продукт/);
  assert.match(source, /пустые команды вроде 'проверьте'/);
  assert.match(source, /не называй продукт лекарством/i);
  assert.match(source, /фиксируй реальный внешний вид/);
  assert.match(source, /Анкета product — источник истины/);
  assert.match(source, /Поля forbidden, restrictions и contentRestrictions — внутренние стоп-правила/);
  assert.match(source, /Не выбирай упаковку как visualObject по умолчанию/);
  assert.match(source, /Хук должен быть понятным без расшифровки ниже/);
  assert.match(source, /CTA не нужен/);
  assert.match(source, /4-6 плотных смысловых блоков/);
  assert.match(source, /сохраняемый скрин/);
  assert.match(source, /рабочая схема/);
  assert.match(source, /читать дольше 5 секунд/);
  assert.match(source, /Продукт не должен быть в каждом посте/);
  assert.match(source, /Headline максимум 6 слов/);
  assert.match(source, /Не смешивай в одной карточке оплату рекламного кабинета, ВПН, нейросети, поддержку и заявки/);
  assert.match(source, /senior SMM strategist/);
  assert.match(source, /viral content marketer 2026/);
  assert.match(source, /вирусный смысл/);
  assert.match(source, /минимальных входных данных оператора/);
  assert.match(source, /shareable value/);
  assert.match(source, /Финальная самопроверка маркетолога/);
  assert.match(source, /триггерный, актуальный, спорный/);
  assert.match(source, /не порочащий репутацию автора/);
  assert.match(source, /Правда, реальные факты, без лжи/);
  assert.match(source, /миф против факта/);
  assert.match(source, /нельзя защитить фактами/);
});

test("content layers rotate beyond direct product ads", () => {
  const project = projects[0];
  const product = products.find((item) => item.id === "magnesium");
  const first = createGenerationJob({ project, product, reference: project.references[0], character: project.characters[0] });
  const second = createGenerationJob({ project, product, reference: project.references[0], character: project.characters[0], existingJobs: [first] });
  const prompt = first.prompt.toLowerCase();

  assert.ok(first.contentLayerId);
  assert.notEqual(first.contentLayerId, second.contentLayerId);
  assert.match(prompt, /слой анализа/);
  assert.match(prompt, /бытовые боли, лайфхаки, советы, привычки, ошибки, мифы/);
});

test("content layer can choose adjacent topics around product", () => {
  const layer = createContentLayer({
    project: projects[0],
    product: products.find((item) => item.id === "magnesium"),
    existingJobs: [
      { contentLayerId: "life-pain" },
      { contentLayerId: "daily-hack" },
      { contentLayerId: "routine-mistake" }
    ]
  });

  assert.equal(layer.id, "adjacent-topic");
  assert.match(layer.instruction, /Тема может идти рядом с продуктом/);
});

test("image prompt forbids technical labels and repeated disclaimers", () => {
  const project = projects[0];
  const product = products.find((item) => item.id === "magnesium");
  const job = createGenerationJob({ project, product, reference: project.references[0], character: project.characters[0] });

  assert.match(job.prompt, /НЕ ИСПОЛЬЗОВАТЬ ТЕХНИЧЕСКИЕ ЗАГОЛОВКИ/);
  assert.match(job.prompt, /ПОНЯТНЫЙ ЗАГОЛОВОК/);
  assert.match(job.prompt, /СВЯЗЬ ПРОДУКТА С ТЕМОЙ/);
  assert.match(job.prompt, /CTA НА ИЗОБРАЖЕНИИ ЗАПРЕЩЕН/);
  assert.match(job.prompt, /КОРОТКИЙ ЗАГОЛОВОК/);
  assert.match(job.prompt, /ЛОГИКА ТЕКСТА/);
  assert.match(job.prompt, /РЕДАКЦИОННЫЙ СТАНДАРТ/);
  assert.match(job.prompt, /Только правдивая информация, реальные факты, без лжи/);
  assert.match(job.prompt, /миф против факта/);
  assert.match(job.prompt, /НЕ ПЕРЕГРУЖАТЬ МАКЕТ/);
  assert.match(job.prompt, /СОХРАНЯЕМЫЙ СКРИН/);
  assert.match(job.prompt, /4-6 коротких смысловых блоков/);
  assert.match(job.prompt, /количество видимых пунктов: [4-6]/);
  assert.match(job.prompt, /Дисклеймеры не являются контентом/);
  assert.match(job.prompt, /ТОЧНОСТЬ ПРОДУКТА/);
  assert.match(job.prompt, /не менять форму упаковки, цвет, этикетку/);
  assert.match(job.prompt, /Не придумывать новые варианты упаковки/);
  assert.match(job.prompt, /Не называть БАД.*лекарством/);
  assert.match(job.prompt, /АНКЕТА ПРОДУКТА — ИСТОЧНИК ИСТИНЫ/);
  assert.match(job.prompt, /Видимые обещания, свойства, состав, формат, объем, бренд, дозировка/);
  assert.match(job.prompt, /не превращать в нижний дисклеймер/);
  assert.doesNotMatch(job.prompt, /БАД\. Есть противопоказания/);
  assert.doesNotMatch(job.prompt, /Дисклеймер:/);
  assert.doesNotMatch(job.prompt, /Дисклеймер: Не обещать лечение/);
  assert.doesNotMatch(job.prompt, /Узнайте больше|Сохраните|Закажите/);
});

test("image prompt treats local product references as transferable image input", () => {
  const project = projects[0];
  const product = {
    ...products.find((item) => item.id === "magnesium"),
    references: [{
      title: "Фото бутылки",
      promptComment: "белая бутылка с зеленой этикеткой",
      imageData: "data:image/png;base64,local"
    }]
  };
  const job = createGenerationJob({ project, product, reference: project.references[0], character: project.characters[0] });

  assert.match(job.prompt, /ПРОДУКТ ПОКАЗЫВАТЬ ТОЛЬКО В ТЕМУ/);
  assert.match(job.prompt, /ПРОДУКТ В КАДРЕ НЕ РАВЕН УПАКОВКЕ/);
  assert.match(job.prompt, /Не пихать упаковку в каждую генерацию/);
  assert.match(job.prompt, /ТОЧНЫЙ PRODUCT IMAGE-TO-IMAGE ДОСТУПЕН/);
  assert.match(job.prompt, /Локальные product reference images будут опубликованы как S3\/public URL/);
  assert.match(job.prompt, /Если тема, хук, пункты или visualObject упоминают продукт/);
  assert.match(job.prompt, /продукт должен быть визуально виден в кадре/);
  assert.match(job.prompt, /не заменяй его абстрактным 3D-объектом/);
});

test("humanizer removes disclaimer points and technical labels", () => {
  const plan = normalizeHumanizedPlan({
    headline: "Почему утро начинается тяжело",
    subhead: "Это бывает даже после долгого сна",
    points: [
      "МЕТАФОРА: телефон не заряжается без кабеля",
      "БОЛЬ: вы просыпаетесь разбитым",
      "Не является лекарственным средством.",
      "Не является медицинским диагнозом.",
      "Информация носит ознакомительный характер.",
      "Не является медицинской рекомендацией.",
      "БОЛЬ: вы просыпаетесь разбитым"
    ],
    disclaimer: "Перед приемом нужна консультация врача."
  }, {
    headline: "",
    subhead: "",
    points: [],
    cta: "",
    disclaimer: "БАД. Есть противопоказания."
  });

  assert.deepEqual(plan.points, [
    "телефон не заряжается без кабеля",
    "вы просыпаетесь разбитым"
  ]);
  assert.equal(plan.disclaimer, "");
});

test("humanizer rewrites technical composition hooks into useful daily pain", () => {
  const plan = normalizeHumanizedPlan({
    headline: "Как простая метафора объясняет проблему: Разбор состава: что внутри и зачем это нужно.",
    subhead: "Популярное объяснение часто заслоняет простую причину.",
    points: [
      "Как в жизни: ощущение сухости и потери тонуса кожи",
      "Где застревает: Бренд: SONRE",
      "Факт: SONRE.",
      "Люди верят узнаваемым деталям, а не обещаниям"
    ]
  }, {
    headline: "Разбор состава: что внутри",
    subhead: "Простая метафора делает проблему понятной за секунду",
    points: []
  });

  const text = `${plan.headline} ${plan.subhead} ${plan.points.join(" ")}`;
  assert.doesNotMatch(text, /разбор состава|простая метафора|Бренд:|Факт: SONRE/i);
  assert.match(text, /кожа|сухост|тонус|привычк|сегодня|обычном дне/i);
});

test("humanizer shortens overloaded headline shells before image prompt", () => {
  const plan = normalizeHumanizedPlan({
    headline: "Популярное объяснение часто сбивает с толку: пополнить рекламный кабинет.",
    subhead: "Покажите не шаги оплаты, а статусы заявки.",
    points: [
      "Заявка принята",
      "Идет проверка",
      "Нужны уточнения"
    ]
  }, {
    headline: "Сначала статус заявки",
    subhead: "",
    points: []
  });

  assert.equal(plan.headline, "пополнить рекламный кабинет");
  assert.ok(plan.headline.split(/\s+/).length <= 6);
  assert.doesNotMatch(plan.headline, /популярное объяснение|:/i);
});

test("fallback semantic plan gives pain, reason and useful action", () => {
  const project = projects[0];
  const product = {
    ...products.find((item) => item.id === "collagen"),
    pains: ["ощущение сухости и потери тонуса кожи"],
    facts: ["регулярный ритуал легче удержать, когда он простой"]
  };
  const brief = createAutoGenerationBrief({
    project,
    product,
    reference: project.references[0],
    generationBrief: { meaningPattern: { id: "hidden-mistake", hook: "Что портит результат", topic: "ошибка в уходе", format: "checklist", visualObject: "рутина ухода" } }
  });
  const plan = createSemanticPlan({ project, product, brief });
  const text = `${plan.subhead} ${plan.points.join(" ")}`.toLowerCase();

  assert.match(text, /привычк|каждый день|сегодня|ритуал|ситуац|в рутину/);
  assert.match(text, /сухост|тонус/);
  assert.doesNotMatch(text, /бренд:|разбор состава|анализ состава/);
});
