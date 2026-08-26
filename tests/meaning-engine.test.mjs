import test from "node:test";
import assert from "node:assert/strict";
import { projects, products } from "../src/domain/entities.js";
import { createAutoGenerationBrief, createGenerationJob, createSemanticPlan } from "../src/domain/generation.js";
import { createMeaningBrief, scoreMeaningBrief } from "../src/domain/meaning-engine.js";
import { renderAvatarSettings } from "../src/ui/avatar.js";
import { renderDesignSettings } from "../src/ui/design.js";
import { renderStudioPanel } from "../src/ui/generation.js";
import { renderProductSettings } from "../src/ui/product.js";
import { renderProjectManagementSettings } from "../src/ui/project.js";
import { renderQueuePanel } from "../src/ui/queue.js";
import { renderProjectSettingsTabs } from "../src/ui/render.js";
import { generateAiBrief } from "../src/services/brief-ai.js";

test("meaning engine adapts viral patterns for non-payment projects", () => {
  const project = {
    ...projects[0],
    projectTheme: "wellness-привычки для женщин 30+",
    keyScenarios: "усталость кажется нормой\nнет понятной рутины",
    allowedTriggers: "признаки, ошибки, чеклист"
  };
  const product = products.find((item) => item.id === "magnesium");
  const brief = createAutoGenerationBrief({ project, product, reference: project.references[0] });
  const plan = createSemanticPlan({ project, product, brief });

  assert.ok(brief.meaningPatternId);
  assert.match(brief.hook, /усталость|рутин|норм|тяжело|уснуть/i);
  assert.match(brief.notes, /Creative Strategy Engine/);
  assert.equal(plan.headline, brief.finalContent.headline);
  assert.ok(plan.points.length >= 3);
});

test("meaning engine scores conflict and visual clarity", () => {
  const project = projects[1];
  const product = products.find((item) => item.id === "serum");
  const meaning = createMeaningBrief({ project, product, reference: project.references[0] });
  const score = scoreMeaningBrief({ brief: meaning, project });

  assert.equal(score.hasConflict, true);
  assert.equal(score.hasVisual, true);
  assert.ok(score.score >= 2);
});

test("generation jobs rotate global meaning patterns", () => {
  const project = {
    ...projects[1],
    projectTheme: "косметика и регулярный уход",
    allowedTriggers: "сравнение, миф, чеклист, ошибка"
  };
  const product = products.find((item) => item.id === "serum");
  const first = createGenerationJob({ project, product, reference: project.references[0], character: project.characters[0] });
  const second = createGenerationJob({ project, product, reference: project.references[0], character: project.characters[0], existingJobs: [first] });

  assert.ok(first.meaningPatternId);
  assert.ok(second.meaningPatternId);
  assert.notEqual(first.meaningPatternId, second.meaningPatternId);
}
);

test("ai brief keeps the locked diversity slot topic", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      draft: {
        semanticKey: "wrong-slot",
        topic: "Сравнение стоимости подписки с комиссией и без",
        hook: "Разный хук"
      }
    })
  });

  try {
    const slot = {
      id: "card-rejected",
      lockTopic: true,
      topic: "Почему зарубежный сервис снова отклоняет оплату",
      hook: "Карта не проходит?",
      format: "mistake-solution",
      visualObject: "красный экран отказа"
    };
    const brief = await generateAiBrief({
      project: projects.find((item) => item.id === "ppm"),
      product: products.find((item) => item.id === "crosspay"),
      reference: projects.find((item) => item.id === "ppm").references[0],
      existingJobs: [],
      diversitySlot: slot
    });

    assert.equal(brief.topic, slot.topic);
    assert.equal(brief.semanticKey, slot.id);
    assert.equal(brief.diversitySlot.id, slot.id);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("ai brief can use generated topic for unlocked diversity slots", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      draft: {
        semanticKey: "wrong-slot",
        topic: "Почему вечернее напряжение мешает восстановиться",
        hook: "Вечером тело не всегда сразу выключается"
      }
    })
  });

  try {
    const slot = {
      id: "life-pain",
      topic: "Ситуация из жизни, где боль уже видна: тяжело уснуть",
      hook: "Вы узнаете это состояние раньше, чем проблему",
      format: "symptoms",
      visualObject: "вечерняя рутина"
    };
    const brief = await generateAiBrief({
      project: projects.find((item) => item.id === "supplements"),
      product: products.find((item) => item.id === "magnesium"),
      reference: projects.find((item) => item.id === "supplements").references[0],
      existingJobs: [],
      diversitySlot: slot
    });

    assert.equal(brief.topic, "Почему вечернее напряжение мешает восстановиться");
    assert.equal(brief.semanticKey, slot.id);
    assert.equal(brief.diversitySlot.id, slot.id);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("humanized ai plan becomes final visible payment text", () => {
  const project = projects.find((item) => item.id === "ppm");
  const product = products.find((item) => item.id === "crosspay");
  const plan = createSemanticPlan({
    project,
    product,
    brief: {
      hook: "Где прячутся риски в зарубежном счете перед оплатой",
      topic: "зарубежный счет",
      semanticKey: "invoice-payment",
      pointCount: "3",
      aiPlan: {
        headline: "Деньги уйдут, а за что — непонятно",
        subhead: "Проверьте счет до оплаты, пока не поздно",
        points: [
          "Кому платите — должно быть ясно",
          "За что платите — без тумана",
          "Срок горит — лучше уточнить сразу"
        ],
        disclaimer: "Условия зависят от площадки"
      }
    }
  });

  assert.equal(plan.headline, "Деньги уйдут, а за что — непонятно");
  assert.match(plan.points.join(" "), /без тумана/);
  assert.equal(plan.disclaimer, "Условия зависят от площадки");
});

test("project management UI exposes limits and autorun controls on the right-side operator surface", () => {
  const html = renderProjectManagementSettings({
    project: projects[2],
    automationState: {
      automation: { enabled: true, targetCount: 10, batchSize: 2, concurrency: 1, lastMessage: "Авторежим включен." },
      activeJobs: 1,
      completedJobs: 6,
      remainingDaily: 8,
      remainingProject: 120,
      canRun: false
    }
  });

  assert.match(html, /Целевая аудитория/);
  assert.match(html, /Тон и стиль видео/);
  assert.match(html, /Что МОЖНО и НУЖНО показывать/);
  assert.match(html, /Возражения клиентов/);
  assert.match(html, /Что нельзя обещать/);
  assert.doesNotMatch(html, /1\. Общая концепция/);
  assert.doesNotMatch(html, /Подпись экспорта/);
  assert.match(html, /data-yandex-folder-picker/);
  assert.match(html, /name="yandexDiskFolder" type="hidden"/);
  assert.match(html, /disk:\/ВИДЕО/);
  assert.match(html, /Дневной лимит генераций/);
  assert.match(html, /Лимит на весь проект/);
  assert.match(html, /В работе[\s\S]*Остановить авторежим/);
  assert.doesNotMatch(html, /Авторежим до лимита/);
  assert.doesNotMatch(html, /Цель роликов/);
  assert.doesNotMatch(html, /Запускать за раз/);
  assert.doesNotMatch(html, /Параллельно в работе/);
  assert.doesNotMatch(html, /Сегодня:/);
  assert.doesNotMatch(html, /data-reset-project-usage/);
  assert.doesNotMatch(html, /data-reset-project-total-usage/);
  assert.doesNotMatch(html, /Сохранить проект|Сохранить изменения/);
  assert.doesNotMatch(html, /Обновить AI-память|AI Audience Expert|AI Strategy|Смысловая база|Сценарные кластеры|Боли аудитории|Tone of voice|Стиль проекта/);
});

test("product settings keep the operator questionnaire compact", () => {
  const html = renderProductSettings({ product: products[0] });

  assert.match(html, /Что это за продукт/);
  assert.match(html, /Зачем покупают/);
  assert.match(html, /УТП продукта/);
  assert.match(html, /Что есть в негативных отзывах у ваших конкурентов/);
  assert.match(html, /Детализация физических свойств продукта/);
  assert.match(html, /Что нельзя обещать/);
  assert.doesNotMatch(html, /Боли аудитории|Желания аудитории|Смежные привычки|Контентная стратегия|Сценарные кластеры/);
});

test("design references ask only for design extraction inputs", () => {
  const project = projects[2];
  const html = renderDesignSettings({ project, reference: project.references[0] });
  const formHtml = html.match(/<form id="reference-form"[\s\S]*?<\/form>/)?.[0] || "";

  assert.match(formHtml, /Название/);
  assert.match(formHtml, /Файл референса/);
  assert.doesNotMatch(formHtml, /Промт|name="prompt"|Опишите стиль с нуля|name="fontStyle"|Доп\. промт|Safe zone|safe zone|Позиция аватара|Тип композиции|Палитра|Стиль заголовка|Главный визуальный объект|не копировать текст|смысл референса/);
});

test("generation style selector hides CTA references", () => {
  const project = projects[0];
  const html = renderStudioPanel({}, {
    project,
    product: products[0],
    reference: project.references[0],
    character: project.characters[0],
    audioLibrary: [],
    audio: null,
    generationBrief: {}
  });

  assert.match(html, /Белый фон \+ плашки/);
  assert.doesNotMatch(html, /Закажи консультацию за 4 секунды/);
  assert.doesNotMatch(html, /CTA 4 сек/);
  assert.doesNotMatch(html, /generation-cta-panel|Плашка \/ текст|ЧИТАЙ ОПИСАНИЕ/);
});

test("generation panel does not render static preview mockup", () => {
  const project = projects[0];
  const html = renderStudioPanel({ jobs: [] }, {
    project,
    product: products[0],
    reference: project.references[0],
    character: project.characters[0],
    audioLibrary: [],
    audio: null,
    generationBrief: {}
  });

  assert.doesNotMatch(html, /phone-preview/);
  assert.doesNotMatch(html, /preview-wrap/);
  assert.doesNotMatch(html, /Открыть превью/);
  assert.doesNotMatch(html, /Авторежим до лимита/);
  assert.doesNotMatch(html, /Цель роликов/);
  assert.doesNotMatch(html, /Новая структура/);
  assert.doesNotMatch(html, /Чистый prompt/);
  assert.doesNotMatch(html, /create-structure-preview/);
});

test("generation panel allows selecting no-avatar mode", () => {
  const project = projects[0];
  const html = renderStudioPanel({ jobs: [] }, {
    project,
    product: products[0],
    reference: project.references[0],
    character: null,
    audioLibrary: [],
    audio: null,
    generationBrief: {}
  });

  assert.match(html, /<option value="__no_avatar__"[^>]*selected[^>]*>Без аватара<\/option>/);
  assert.doesNotMatch(html, /Плашка \/ текст/);
  assert.doesNotMatch(html, /Эти настройки работают и в режиме без аватара/);
});

test("generation panel explains when an active reservation blocks a launch", () => {
  const project = { ...projects[0], projectLimit: 1, usedTotal: 0 };
  const html = renderStudioPanel({
    jobs: [{ id: "active-job", projectId: project.id, status: "running" }]
  }, {
    project,
    product: products[0],
    reference: project.references[0],
    character: null,
    audioLibrary: [],
    audio: null,
    generationBrief: {}
  });

  assert.match(html, /id="create-job"[^>]*disabled/);
  assert.match(html, /Нельзя запустить: Лимит проекта исчерпан/);
});

test("generation operation panels hide provider and task identifiers", () => {
  const project = projects[2];
  const html = [
    renderAvatarSettings({
      project: {
        ...project,
        avatarCandidates: [{ id: "candidate", name: "Антон", status: "generating", taskId: "task_internal" }]
      },
      character: project.characters[0]
    }),
    renderQueuePanel({
      jobs: [{
        id: "job",
        projectId: project.id,
        status: "running",
        stage: "image",
        progress: 45,
        title: "Тестовая генерация",
        topic: "оплата подписки",
        music: "аудио проекта",
        inputUrls: ["ref"]
      }]
    }, { project })
  ].join("\n");

  assert.match(html, /Результат появится автоматически/);
  assert.doesNotMatch(html, /taskId|task_internal|Kie\.ai|OpenRouter|GPT Image|model|модел/i);
});

test("project settings tab renames avatars to avatar plus cta", () => {
  const html = renderProjectSettingsTabs({
    selectedProjectTab: "avatars",
    products,
    projects,
    selectedProjectId: projects[0].id
  }, {
    project: projects[0],
    product: products[0],
    reference: projects[0].references[0],
    character: projects[0].characters[0],
    audioLibrary: [],
    audio: null,
    generationBrief: {}
  });

  assert.match(html, /Аватар \+ плашка/);
});

test("queue waits for final video before marking final-video job ready", () => {
  const project = projects[0];
  const html = renderQueuePanel({
    jobs: [{
      id: "job-final-pending",
      projectId: project.id,
      status: "running",
      stage: "assembly",
      progress: 80,
      outputType: "final-video",
      imageUrl: "https://cdn.example.com/background.png",
      title: "Финальный ролик",
      topic: "утренний ритуал",
      music: "аудио проекта",
      inputUrls: ["ref"]
    }]
  }, { project });

  assert.match(html, /Собираем видео/);
  assert.doesNotMatch(html, /<img src=/);
  assert.doesNotMatch(html, /ready/);
  assert.doesNotMatch(html, /Кликните по превью/);
});
