import { getPatternInstruction, pickScenarioPattern } from "./creative-patterns.js";
import { adaptHookFromReference, selectHookReference } from "./hook-library.js";

export function createMeaningBrief({ project, product, reference, generationBrief = {}, existingJobs = [] }) {
  const pattern = generationBrief.meaningPattern || pickScenarioPattern({ project, existingJobs });
  const angle = firstAvailable([
    generationBrief.topic,
    meaningFirstLine(project.keyScenarios),
    meaningFirstLine(project.audiencePains),
    meaningFirstListItem(product.pains),
    project.projectTheme,
    product.name
  ]);
  const hookReference = generationBrief.hookReference || selectHookReference({
    project,
    product,
    pattern,
    slot: generationBrief.diversitySlot
  });
  const referenceHook = hookReference ? adaptHookFromReference(hookReference, { project, product, angle }) : "";
  const hook = referenceHook
    || generationBrief.hook
    || adaptHook(pattern.hook, { project, product, angle });
  return {
    pattern,
    hookReference,
    topic: generationBrief.topic || adaptTopic(pattern.topic, { project, product, angle }),
    hook,
    format: generationBrief.format || pattern.format || reference?.layoutType || "checklist",
    visualObject: generationBrief.visualObject || adaptVisualObject(pattern.visualObject, { product }),
    notes: [
      generationBrief.notes || "",
      `Creative Strategy Engine: ${pattern.id}`,
      hookReference ? `Hook reference: ${hookReference.text}. Теги: ${(hookReference.tags || []).join(", ")}. Не копировать механически, адаптировать под тему.` : "",
      getPatternInstruction(pattern)
    ].filter(Boolean).join(" ")
  };
}

export function createUniversalSemanticPlan({ project, product, brief }) {
  if (brief.aiPlan?.points?.length) {
    return {
      headline: brief.aiPlan.headline || brief.hook,
      subhead: brief.aiPlan.subhead || brief.topic,
      points: brief.aiPlan.points.slice(0, Number(brief.pointCount) || 5),
      cta: brief.cta || product.name,
      disclaimer: brief.aiPlan.disclaimer || getUniversalDisclaimer(project)
    };
  }

  const patternId = brief.meaningPatternId || brief.meaningPattern?.id || "before-check";
  const builders = {
    "red-flag": redFlagPlan,
    "hidden-mistake": hiddenMistakePlan,
    "before-check": beforeCheckPlan,
    "classification": classificationPlan,
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
  const pain = meaningFirstListItem(product.pains) || "сигнал повторяется несколько дней";
  const fact = meaningFirstListItem(product.facts) || product.description || "мелкая привычка часто влияет сильнее, чем кажется";
  return {
    subhead: "Сначала проверьте, это разовая мелочь или повторяющийся сигнал.",
    points: [
      `В жизни: ${pain}`,
      `Проверьте: когда это появляется чаще всего`,
      `Полезный факт: ${fact}`,
      `Что сделать сегодня: уберите один лишний раздражитель`,
      `Мягкий шаг: ${product.offer || product.name}`
    ]
  };
}

function hiddenMistakePlan({ product }) {
  const pain = meaningFirstListItem(product.pains) || "усталость списывают на обычный день";
  const fact = meaningFirstListItem(product.facts) || product.description || "важны условия и регулярность";
  return {
    subhead: "Проблема часто прячется в привычке, которую делают каждый день.",
    points: [
      `Кажется мелочью: ${pain}`,
      "Потом повторяется и становится фоном",
      `Почему так бывает: ${fact}`,
      "Лайфхак: меняйте не все, а один шаг",
      `Следующий шаг: ${product.offer || product.name}`
    ]
  };
}

function beforeCheckPlan({ product }) {
  const pain = meaningFirstListItem(product.pains) || "силы есть, а восстановления нет";
  const fact = meaningFirstListItem(product.facts) || product.description || "одна деталь меняет ощущение дня";
  return {
    subhead: "Перед покупкой полезнее понять, что происходит в обычном дне.",
    points: [
      `Ситуация: ${pain}`,
      `Что часто упускают: ${fact}`,
      "Что проверить сегодня: сон, воду и нагрузку",
      "Если причина повторяется, нужен спокойный ритуал",
      `Мягкий шаг: ${product.offer || product.name}`
    ]
  };
}

function classificationPlan({ product }) {
  const items = product.pains?.length ? product.pains : ["легкий сигнал", "повторяется часто", "мешает результату"];
  return {
    subhead: "Отметьте, что повторяется чаще всего именно у вас.",
    points: items.map((item) => `Если так: ${item}`).concat([
      `Почему важно: ${meaningFirstListItem(product.facts) || product.description || "важен повторяющийся паттерн"}`,
      `Что попробовать: ${product.offer || product.name}`
    ])
  };
}

function mythRealityPlan({ product }) {
  const pain = meaningFirstListItem(product.pains) || "проблему списывают на лень";
  const fact = meaningFirstListItem(product.facts) || product.description || "важны условия, ритм и контекст";
  return {
    subhead: "Привычная версия часто мешает увидеть простую причину.",
    points: [
      `Миф: ${pain}`,
      `На деле: ${fact}`,
      "Лайфхак: ищите повтор, а не виноватого",
      "Полезно: начать с маленького вечернего шага",
      `Мягкий шаг: ${product.offer || product.name}`
    ]
  };
}

function metaphorPlan({ product }) {
  const pain = meaningFirstListItem(product.pains) || "день вроде прошел, а ресурс не вернулся";
  const fact = meaningFirstListItem(product.facts) || product.description || "в маленькой повторяющейся детали";
  return {
    subhead: "Объясните проблему на примере, который человек видит каждый день.",
    points: [
      `Как в жизни: ${pain}`,
      `Где застревает: ${fact}`,
      "Что заметить сегодня: время, повтор и реакцию",
      "Лайфхак: упростите один шаг рутины",
      `Что может помочь: ${product.offer || product.name}`
    ]
  };
}

function adaptHook(template, { project, product, angle }) {
  const subject = shortSubject(project, product, angle);
  if (!subject) return template;
  if (/это/i.test(template)) return template.replace(/это/i, subject);
  return `${template}: ${subject}`;
}

function adaptTopic(template, { project, product, angle }) {
  const context = angle || project.projectTheme || product.name;
  return `${template}: ${context}`;
}

function adaptVisualObject(template, { product }) {
  return `${template}; главный объект — ${product.name}`;
}

function shortSubject(project, product, angle) {
  return firstAvailable([angle, project.niche, project.projectTheme, product.name]).split(/[,.]/)[0].slice(0, 80);
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
