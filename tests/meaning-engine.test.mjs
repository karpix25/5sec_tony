import test from "node:test";
import assert from "node:assert/strict";
import { projects, products } from "../src/domain/entities.js";
import { createAutoGenerationBrief, createGenerationJob, createSemanticPlan } from "../src/domain/generation.js";
import {
  adaptHookFromReference,
  applyHookDraft,
  createHookDraft,
  setHookVersionStatus,
  toggleHookEnabled
} from "../src/domain/hook-library.js";
import { createMeaningBrief, scoreMeaningBrief } from "../src/domain/meaning-engine.js";
import { renderAvatarSettings } from "../src/ui/avatar.js";
import { renderDesignSettings } from "../src/ui/design.js";
import { renderStudioPanel } from "../src/ui/generation.js";
import { renderHooksPanel } from "../src/ui/hooks.js";
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
  assert.match(brief.hook, /ошиб|проверь|результат|хаос|не замеч|обсуждают|не покуп|тратить/i);
  assert.match(brief.notes, /Creative Strategy Engine/);
  assert.equal(plan.headline, brief.hook);
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

test("hook library creates versioned reusable references", () => {
  const draft = createHookDraft({
    title: "Референсы желтой прессы",
    text: "7 красных флагов [темы]\n7 красных флагов [темы]\nОшибка, которая стоит вам денег"
  });

  assert.equal(draft.hooks.length, 2);
  assert.equal(draft.duplicateCount, 1);

  const first = applyHookDraft({ versions: [] }, draft);
  const second = applyHookDraft(first, createHookDraft({ title: "Новая версия", text: "Проверь это до оплаты" }));

  assert.equal(second.versions[0].status, "active");
  assert.equal(second.versions[1].status, "archive");
  assert.equal(second.activeVersionId, second.versions[0].id);

  const testing = setHookVersionStatus(second, second.versions[0].id, "test");
  assert.equal(testing.activeVersionId, "");
  assert.equal(testing.versions[0].status, "test");

  const toggled = toggleHookEnabled(second, second.versions[0].hooks[0].id);
  assert.equal(toggled.versions[0].hooks[0].enabled, false);
});

test("hook references adapt to project subject instead of being copied raw", () => {
  const project = {
    ...projects[0],
    projectTheme: "оплата зарубежных сервисов рублями",
    audiencePains: "банк отклоняет платеж, подписка сгорает"
  };
  const hook = { text: "7 красных флагов [темы]" };
  const adapted = adaptHookFromReference(hook, { project, product: null, angle: "подписка не проходит" });

  assert.match(adapted, /подписка не проходит/);
  assert.doesNotMatch(adapted, /\[темы\]/);
});

test("pdf hook placeholders adapt to project context", () => {
  const project = {
    ...projects.find((item) => item.id === "ppm"),
    projectTheme: "оплата зарубежных подписок"
  };
  const product = products.find((item) => item.id === "crosspay");
  const hook = { text: "N вещей, которые я хотел бы знать до N лет. (Ниша, клиент)" };
  const adapted = adaptHookFromReference(hook, { project, product, angle: "карта не проходит" });

  assert.doesNotMatch(adapted, /\(Ниша, клиент\)|\bN\b/i);
  assert.match(adapted, /карта не проходит|оплата зарубежных подписок/);
});

test("generic first-person hook gets rewritten into niche-specific hook", () => {
  const project = {
    ...projects.find((item) => item.id === "ppm"),
    projectTheme: "оплата зарубежных подписок"
  };
  const product = products.find((item) => item.id === "crosspay");
  const hook = { text: "Я (что-то сделал) с 5 (вещей) и это мой топ-5!" };
  const adapted = adaptHookFromReference(hook, { project, product, angle: "карта не проходит" });

  assert.doesNotMatch(adapted, /\(|\)|что-то|Я /i);
  assert.match(adapted, /5 /);
  assert.match(adapted, /карта не проходит|оплата зарубежных подписок/i);
});

test("same hook template adapts differently for another niche", () => {
  const project = {
    ...projects.find((item) => item.id === "supplements"),
    projectTheme: "вечерний wellness-ритуал"
  };
  const product = products.find((item) => item.id === "magnesium");
  const hook = { text: "7 красных флагов [темы]" };
  const adapted = adaptHookFromReference(hook, { project, product, angle: "тяжело уснуть" });

  assert.match(adapted, /тяжело уснуть|вечерний wellness-ритуал/i);
  assert.doesNotMatch(adapted, /\[темы\]/);
});

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

test("payment generation turns active hook references into headline and text plan", () => {
  const previousWindow = globalThis.window;
  const memory = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => memory.get(key) || null,
      setItem: (key, value) => memory.set(key, value)
    }
  };

  try {
    applyHookDraft({ versions: [] }, createHookDraft({ text: "7 красных флагов [темы]" }));
    const project = { ...projects.find((item) => item.id === "ppm"), projectTheme: "оплата зарубежных сервисов" };
    const product = products.find((item) => item.id === "crosspay");
    const brief = createAutoGenerationBrief({ project, product, reference: project.references[0] });
    const plan = createSemanticPlan({ project, product, brief });

    assert.equal(brief.hookReference.text, "7 красных флагов [темы]");
    assert.match(brief.hook, /7 красных флагов/);
    assert.equal(plan.headline, brief.hook);
    assert.match(plan.points.join(" "), /Красный флаг|Норма/);
  } finally {
    globalThis.window = previousWindow;
  }
});

test("hook references override ai brief hook for final generation", () => {
  const previousWindow = globalThis.window;
  const memory = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => memory.get(key) || null,
      setItem: (key, value) => memory.set(key, value)
    }
  };

  try {
    applyHookDraft({ versions: [] }, createHookDraft({ text: "7 красных флагов [темы]" }));
    const project = { ...projects.find((item) => item.id === "ppm"), projectTheme: "оплата зарубежных сервисов" };
    const product = products.find((item) => item.id === "crosspay");
    const brief = createAutoGenerationBrief({
      project,
      product,
      reference: project.references[0],
      generationBrief: { hook: "Бронь держат недолго: успейте проверить оплату", pointCount: "4" }
    });

    assert.match(brief.hook, /7 красных флагов/);
    assert.equal(brief.pointCount, "7");
  } finally {
    globalThis.window = previousWindow;
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

  assert.equal(plan.headline, "Где прячутся риски в зарубежном счете перед оплатой");
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
      remainingTarget: 3
    }
  });

  assert.match(html, /Ниша и суть проекта/);
  assert.match(html, /Кто покупает/);
  assert.match(html, /Что нельзя обещать/);
  assert.match(html, /data-yandex-folder-picker/);
  assert.match(html, /name="yandexDiskFolder" type="hidden"/);
  assert.match(html, /disk:\/ВИДЕО/);
  assert.match(html, /Дневной лимит генераций/);
  assert.match(html, /Лимит на весь проект/);
  assert.match(html, /Авторежим до лимита/);
  assert.match(html, /Цель роликов/);
  assert.match(html, /Параллельно/);
  assert.match(html, /data-reset-project-usage/);
  assert.match(html, /data-reset-project-total-usage/);
  assert.match(html, /Сохранить проект/);
  assert.doesNotMatch(html, /Обновить AI-память|AI Audience Expert|AI Strategy|Смысловая база|Сценарные кластеры|Боли аудитории|Tone of voice|Стиль проекта/);
});

test("product settings keep the operator questionnaire compact", () => {
  const html = renderProductSettings({ product: products[0] });

  assert.match(html, /Что это за продукт/);
  assert.match(html, /Зачем покупают/);
  assert.match(html, /Роль продукта/);
  assert.match(html, /Можно говорить/);
  assert.match(html, /Что нельзя обещать/);
  assert.doesNotMatch(html, /Боли аудитории|Желания аудитории|Смежные привычки|Контентная стратегия|Сценарные кластеры/);
});

test("hooks UI hides version workflow from the main operator surface", () => {
  const html = renderHooksPanel();

  assert.match(html, /Список хуков текстом/);
  assert.match(html, /Использовать эти хуки/);
  assert.doesNotMatch(html, /active|test|archive|Активная|Тестовая|Архивная|версия|версии|Название версии/i);
});

test("design references ask only for design extraction inputs", () => {
  const project = projects[2];
  const html = renderDesignSettings({ project, reference: project.references[0] });
  const formHtml = html.match(/<form id="reference-form"[\s\S]*?<\/form>/)?.[0] || "";

  assert.match(formHtml, /Название/);
  assert.match(formHtml, /Файл референса/);
  assert.match(formHtml, /Промт/);
  assert.doesNotMatch(formHtml, /name="fontStyle"|Доп\. промт|Safe zone|safe zone|Позиция аватара|Тип композиции|Палитра|Стиль заголовка|Главный визуальный объект|не копировать текст|смысл референса/);
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
  assert.match(html, /Плашка \/ текст/);
  assert.match(html, /Эти настройки работают и в режиме без аватара/);
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
