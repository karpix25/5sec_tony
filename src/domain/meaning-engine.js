import { getPatternInstruction, pickScenarioPattern } from "./creative-patterns.js";
import { adaptHookFromReference, selectHookReference } from "./hook-library.js";
import { createHookProductBridge } from "./hook-product-bridge.js";
import { writeHookFromFormula } from "./hook-formula-writer.js";
import { getProductContentFocus } from "./product-content-focus.js";
import { getExplicitHeadline, isHeadlineLocked, resolveHeadlineFormula } from "./headline-diversity.js";

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
  const headlineLocked = isHeadlineLocked(generationBrief);
  const hookCandidate = headlineLocked && getExplicitHeadline(generationBrief)
    ? getExplicitHeadline(generationBrief)
    : referenceHook
      || generationBrief.hook
      || adaptHook(pattern.hook, { project, product, angle });
  const diversity = resolveHeadlineFormula({
    headline: hookCandidate,
    existingJobs,
    recentFormulas: generationBrief.recentFormulas || generationBrief.recentHeadlineFormulas,
    locked: headlineLocked
  });
  const hook = diversity.changed
    ? writeHookFromFormula(hookCandidate, {
        subject: angle,
        object: angle,
        problem: angle,
        result: angle,
        count: "5",
        formula: diversity.formula,
        existingJobs,
        recentFormulas: diversity.history,
        variantSeed: `${project?.id || ""} ${product?.id || ""} ${angle || ""} ${diversity.formula}`
      })
    : hookCandidate;
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

  // Fallback if AI plan is missing (now highly simplified)
  return {
    headline: brief.hook || product.name,
    subhead: brief.topic || "Проверьте контекст перед выбором",
    points: ["Важный факт", "Контекст", "Следующий шаг"],
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
