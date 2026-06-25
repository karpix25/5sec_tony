import { getPatternInstruction, pickScenarioPattern } from "./creative-patterns.js";
import { adaptHookFromReference, selectHookReference } from "./hook-library.js";
import { createHookProductBridge } from "./hook-product-bridge.js";
import { writeHookFromFormula } from "./hook-formula-writer.js";
import { getProductContentFocus } from "./product-content-focus.js";

export function createMeaningBrief({ project, product, reference, generationBrief = {}, existingJobs = [], hookLibrary }) {
  const pattern = generationBrief.meaningPattern || pickScenarioPattern({ project, existingJobs });
  const focus = getProductContentFocus({ project, product });
  const angle = firstAvailable([
    generationBrief.diversitySlot?.contentLayer?.subject,
    meaningFirstLine(project.keyScenarios),
    meaningFirstLine(project.audiencePains),
    meaningFirstListItem(product.pains),
    focus.subject,
    product.offer,
    generationBrief.topic,
    project.projectTheme,
    product.name
  ]);
  const hookReference = generationBrief.hookReference || selectHookReference({
    hookLibrary,
    project,
    product,
    pattern,
    slot: generationBrief.diversitySlot,
    existingJobs
  });
  const referenceHook = hookReference ? adaptHookFromReference(hookReference, { project, product, angle }) : "";
  const hookBridge = createHookProductBridge({
    hookReference,
    adaptedHook: referenceHook,
    project,
    product,
    angle
  });
  const hook = referenceHook
    || generationBrief.hook
    || adaptHook(pattern.hook, { project, product, angle });
  return {
    pattern,
    hookReference,
    topic: hookBridge?.topic || generationBrief.topic || adaptTopic(pattern.topic, { project, product, angle }),
    hook,
    format: generationBrief.format || pattern.format || reference?.layoutType || "story-card",
    visualObject: generationBrief.visualObject || adaptVisualObject(pattern.visualObject, { project, product }),
    aiPlan: hookBridge?.aiPlan || null,
    notes: [
      generationBrief.notes || "",
      `Creative Strategy Engine: ${pattern.id}`,
      hookReference ? `Hook reference: ${hookReference.text}. Теги: ${(hookReference.tags || []).join(", ")}. Не копировать механически, адаптировать под тему.` : "",
      hookBridge?.notes || "",
      getPatternInstruction(pattern)
    ].filter(Boolean).join(" ")
  };
}

export function createUniversalSemanticPlan({ project, product, brief }) {
  if (brief.aiPlan?.points?.length) {
    return {
      headline: brief.finalContent?.headline || brief.aiPlan.headline || brief.hook,
      subhead: brief.finalContent?.subhead || brief.aiPlan.subhead || brief.topic,
      points: brief.aiPlan.points.slice(0, Number(brief.pointCount) || 5),
      cta: brief.cta || product.name,
      disclaimer: brief.finalContent?.disclaimer || brief.aiPlan.disclaimer || getUniversalDisclaimer(project)
    };
  }

  const patternId = brief.meaningPatternId || brief.meaningPattern?.id || "decision-check";
  const builders = {
    "red-flag": redFlagPlan,
    "hidden-mistake": hiddenMistakePlan,
    "decision-check": beforeCheckPlan,
    "before-check": beforeCheckPlan,
    "classification": classificationPlan,
    "expectation-shift": expectationShiftPlan,
    "myth-reality": mythRealityPlan,
    metaphor: metaphorPlan
  };
  const plan = (builders[patternId] || beforeCheckPlan)({ project, product, brief });
  return {
    headline: brief.hook,
    subhead: plan.subhead,
    points: plan.points.slice(0, Number(brief.pointCount) || 5),
    cta: brief.cta || product.name,
    disclaimer: getUniversalDisclaimer(project)
  };
}

export function scoreMeaningBrief({ brief, project }) {
  const text = `${brief.hook || ""} ${brief.topic || ""} ${brief.visualObject || ""}`.toLowerCase();
  const hasConflict = /ошиб|красн|риск|проверь|не делайте|лома|норма|миф|застрев/.test(text);
  const hasVisual = Boolean(brief.visualObject);
  const hasRestrictionRisk = splitMeaningLines(project.forbiddenTriggers)
    .some((item) => item && text.includes(item));
  return {
    score: [hasConflict, hasVisual, !hasRestrictionRisk].filter(Boolean).length,
    hasConflict,
    hasVisual,
    hasRestrictionRisk
  };
}

function redFlagPlan({ product }) {
  const focus = getProductContentFocus({ product });
  const pain = focus.pain || "важный сигнал легко пропустить";
  const fact = focus.fact || "контекст меняет решение сильнее, чем кажется";
  return {
    subhead: "Сначала отделите полезный факт от красивого обещания.",
    points: [
      `Сигнал: ${pain}`,
      `Проверьте контекст: ${focus.context || fact}`,
      `Полезный факт: ${fact}`,
      `Что сделать: ${focus.action || "сравнить факты перед решением"}`,
      `Следующий шаг: ${focus.action || product.offer || product.name}`
    ]
  };
}

function hiddenMistakePlan({ product }) {
  const focus = getProductContentFocus({ product });
  const pain = focus.pain || "важную деталь проверяют слишком поздно";
  const fact = focus.fact || "мелкая деталь часто меняет итог";
  return {
    subhead: "Проблема часто прячется не в выборе, а в пропущенной детали.",
    points: [
      `Ошибка: ${pain}`,
      `Что упускают: ${focus.context || fact}`,
      `Почему так бывает: ${fact}`,
      `Как проверить: ${focus.action || "собрать факты до решения"}`,
      `Следующий шаг: ${focus.action || product.offer || product.name}`
    ]
  };
}

function beforeCheckPlan({ product }) {
  const focus = getProductContentFocus({ product });
  const pain = focus.pain || "решение принимают без контекста";
  const fact = focus.fact || "одна деталь меняет итог";
  return {
    subhead: "Перед решением полезнее проверить факты, а не только красивую формулировку.",
    points: [
      `Ситуация: ${focus.context || pain}`,
      `Что часто упускают: ${fact}`,
      `Что проверить: ${focus.action || "условия, место и контекст"}`,
      "Если детали не сходятся, лучше перепроверить источник",
      `Мягкий шаг: ${focus.action || product.offer || product.name}`
    ]
  };
}

function classificationPlan({ product }) {
  const focus = getProductContentFocus({ product });
  const items = focus.list.length ? focus.list.slice(0, 3) : ["важный факт", "контекст", "следующий шаг"];
  return {
    subhead: "Разложите тему на признаки, чтобы не принимать решение по красивой обложке.",
    points: items.map((item) => `Если так: ${item}`).concat([
      `Почему важно: ${focus.fact || "важен конкретный факт"}`,
      `Что попробовать: ${focus.action || product.offer || product.name}`
    ])
  };
}

function expectationShiftPlan({ product }) {
  const focus = getProductContentFocus({ product });
  const pain = focus.pain || "кажется, что одного общего совета достаточно";
  const fact = focus.fact || "контекст важнее общей формулировки";
  return {
    subhead: "Привычное объяснение часто мешает увидеть полезный факт.",
    points: [
      `Ожидание: ${pain}`,
      `Что видно на деле: ${fact}`,
      `Что проверить: ${focus.context || fact}`,
      `Полезно: ${focus.action || "сравнить несколько источников"}`,
      `Мягкий шаг: ${focus.action || product.offer || product.name}`
    ]
  };
}

const mythRealityPlan = expectationShiftPlan;

function metaphorPlan({ product }) {
  const focus = getProductContentFocus({ product });
  const pain = focus.pain || "все выглядит понятно, пока не появляется контекст";
  const fact = focus.fact || "маленькая деталь меняет картину";
  return {
    subhead: "Объясните тему через понятную ситуацию, а не через название продукта.",
    points: [
      `Как в жизни: ${focus.context || pain}`,
      `Где застревает: ${fact}`,
      `Что заметить: ${focus.subject || fact}`,
      `Лайфхак: ${focus.action || "сначала проверить контекст"}`,
      `Что может помочь: ${focus.action || product.offer || product.name}`
    ]
  };
}

function adaptHook(template, { project, product, angle }) {
  const subject = shortSubject(project, product, angle);
  if (!template) return subject;
  if (!subject) return template;
  if (/норма|красн|флаг|ошиб|проверь|миф|почему|вещ|признак/i.test(template)) {
    return writeHookFromFormula(template, {
      subject,
      object: subject,
      problem: subject,
      result: subject,
      count: "5",
      variantSeed: `${project?.id || ""} ${product?.id || ""} ${angle || ""}`
    });
  }
  if (/это/i.test(template)) return template.replace(/это/i, subject);
  return `${template}: ${subject}`;
}

function adaptTopic(template, { project, product, angle }) {
  const focus = getProductContentFocus({ project, product });
  const context = angle || focus.subject || project.projectTheme || product.name;
  if (!template) return context;
  return `${template}: ${context}`;
}

function adaptVisualObject(template, { product, project }) {
  const focus = getProductContentFocus({ project, product });
  if (!template) return focus.subject || product.description || product.name;
  return `${template}; главный объект — ${focus.subject || product.description || product.name}`;
}

function shortSubject(project, product, angle) {
  const focus = getProductContentFocus({ project, product });
  return firstAvailable([angle, focus.subject, project.niche, project.projectTheme, product.name]).split(/[,.]/)[0].slice(0, 80);
}

function getUniversalDisclaimer(project) {
  const source = `${project.name || ""} ${project.niche || ""} ${project.companyInfo || ""} ${project.projectTheme || ""}`.toLowerCase();
  if (/бад|нутри|wellness|витамин|магни|коллаген|космет/.test(source)) {
    return "";
  }
  return project.contentRestrictions || "Проверяйте условия и факты перед решением";
}

function firstAvailable(items) {
  return items.map((item) => String(item || "").trim()).find(Boolean) || "";
}

function meaningFirstLine(value) {
  return String(value || "").split(/\n|;/).map((item) => item.trim()).find(Boolean) || "";
}

function meaningFirstListItem(value) {
  return Array.isArray(value) ? value.find(Boolean) || "" : meaningFirstLine(value);
}

function splitMeaningLines(value) {
  return String(value || "")
    .split(/\n|;/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}
