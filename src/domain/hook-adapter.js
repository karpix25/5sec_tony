import { buildProductProfile } from "./product-profile.js";
import { normalizeHookPhrase } from "./hook-phrase-normalizer.js";

const genericPlaceholderPattern = /\[.*?\]|\(.*?\)|\bчто-то\b|\bчего-то\b|\bвещей\b/gi;

export function adaptHookText(templateHook, { project, product, angle } = {}) {
  const template = String(templateHook?.text || templateHook || "").trim();
  if (!template) return "";
  const safeProduct = product || {
    name: "",
    description: "",
    pains: [],
    facts: [],
    offer: "",
    components: "",
    forbidden: [],
    references: []
  };
  const profile = buildProductProfile({ project, product: safeProduct });
  const context = createHookAdaptationContext({ project, product: safeProduct, angle, profile, template });

  let text = normalizeTemplateText(template);
  text = text.replace(/\bN\b/g, context.count);
  text = applyPlaceholderReplacements(text, context);
  text = cleanupUnresolvedParts(text);

  if (shouldRewriteHook(template, text)) {
    text = rewriteHookFromShape(template, context);
  }

  return finalizeHook(text, context);
}

function createHookAdaptationContext({ project, product, angle, profile, template }) {
  const rawCondition = hookAdapterFirstAvailable([
    angle,
    profile.primaryPain,
    profile.primaryUseCase,
    project?.projectTheme,
    product?.name
  ]);
  const subject = hookAdapterFirstAvailable([
    angle,
    profile.primaryUseCase,
    profile.primaryPain,
    project?.projectTheme,
    project?.niche,
    product?.name
  ]);
  const scenario = hookAdapterFirstAvailable([
    angle,
    profile.primaryUseCase,
    project?.keyScenarios,
    project?.projectTheme
  ]);
  const problem = hookAdapterFirstAvailable([
    profile.primaryPain,
    angle,
    project?.audiencePains,
    product?.name
  ]);
  const result = hookAdapterFirstAvailable([
    product?.offer,
    profile.primaryProof,
    project?.audienceDesires,
    product?.name
  ]);
  const count = getReferenceCount(template) || "5";

  return {
    count,
    subject: hookAdapterShortPhrase(subject, 64),
    condition: hookAdapterShortPhrase(rawCondition, 64),
    conditionClause: toConditionClause(rawCondition),
    scenario: hookAdapterShortPhrase(scenario, 64),
    problem: hookAdapterShortPhrase(problem, 64),
    result: hookAdapterShortPhrase(result, 64),
    object: hookAdapterShortPhrase(profile.primaryUseCase || profile.primaryProof || subject || product?.name, 64),
    action: hookAdapterShortPhrase(project?.keyScenarios || profile.primaryUseCase || "это", 64)
  };
}

function applyPlaceholderReplacements(text, context) {
  const replacements = {
    "\\[тема\\]": context.subject,
    "\\[темы\\]": context.subject,
    "\\[объект\\]": context.object,
    "\\[объекта\\]": context.object,
    "\\[проблема\\]": context.problem,
    "\\[проблемы\\]": context.problem,
    "\\[результат\\]": context.result,
    "\\(ниша, клиент\\)": context.subject,
    "\\(ниша\\)": context.subject,
    "\\(клиент\\)": context.object,
    "\\(проект, блог, способ что-то делать\\)": context.subject,
    "\\(чего-то\\)": context.subject,
    "\\(что-то\\)": context.object,
    "\\(действие\\)": context.action,
    "\\(сайт, ресурс, портал\\)": context.object,
    "\\(сайт, приложение, инструмент\\)": context.object,
    "\\(мест, вещей, ресторанов и тд\\)": context.subject,
    "\\(город, страна\\)": context.subject,
    "\\(страна, город\\)": context.subject,
    "\\(указать боли аудитории\\)": context.problem
  };

  let next = text;
  Object.entries(replacements).forEach(([pattern, value]) => {
    next = next.replace(new RegExp(pattern, "gi"), value);
  });
  return next;
}

function shouldRewriteHook(template, text) {
  return genericPlaceholderPattern.test(template)
    || genericPlaceholderPattern.test(text)
    || /\bя\b/i.test(text)
    || /топ-\d/i.test(text)
    || text.length > 90;
}

function rewriteHookFromShape(template, context) {
  const source = normalizeTemplateText(template).toLowerCase();
  if (/красн.*флаг/.test(source)) return `${context.count} красных флагов, ${context.conditionClause}`;
  if (/что проверить|проверь/.test(source)) return `Что проверить, ${context.conditionClause}`;
  if (/ошиб/.test(source)) return `Ошибка, из-за которой ${context.problem}`;
  if (/миф|правда|реальн/.test(source)) return `Миф, который мешает, ${context.conditionClause}`;
  if (/почему/.test(source)) return `Почему ${context.problem}`;
  if (/топ-\d|\b\d+\b.*вещ|хотел бы знать|я .*топ/.test(source)) {
    return `${context.count} вещей, которые стоит знать, ${context.conditionClause}`;
  }
  return `${context.count} вещей, которые стоит проверить, ${context.conditionClause}`;
}

function finalizeHook(text, context) {
  let next = normalizeTemplateText(text)
    .replace(/\s*[:|-]\s*$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (!next) return `Что проверить, ${context.conditionClause}`;
  if (genericPlaceholderPattern.test(next)) return rewriteHookFromShape(next, context);
  return next;
}

function cleanupUnresolvedParts(text) {
  return normalizeTemplateText(
    String(text || "")
      .replace(/\[[^\]]*\]/g, "")
      .replace(/\([^)]*\)/g, "")
  );
}

function toConditionClause(value) {
  const phrase = hookAdapterShortPhrase(value, 64);
  if (!phrase) return "если ситуация повторяется";
  if (/^(если|когда|почему|зачем|перед|после|при)\b/i.test(phrase)) return phrase;
  if (/^(о|об|про)\s+/i.test(phrase)) return `по теме: ${normalizeHookPhrase(phrase)}`;
  return `если ${hookAdapterLowercaseFirst(phrase)}`;
}

function normalizeTemplateText(value) {
  return String(value || "")
    .replace(/[«»"]/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.:!?])/g, "$1")
    .trim();
}

function getReferenceCount(value) {
  const match = String(value || "").match(/\b([3-9])\b/);
  return match ? match[1] : "";
}

function hookAdapterShortPhrase(value, max = 64) {
  const phrase = hookAdapterFirstAvailable([value]).split(/\n|;|,/)[0].trim();
  return phrase.slice(0, max).replace(/[:.!?]+$/g, "").trim();
}

function hookAdapterLowercaseFirst(value) {
  return value ? value.charAt(0).toLowerCase() + value.slice(1) : "";
}

function hookAdapterFirstAvailable(items) {
  return items.map((item) => String(item || "").trim()).find(Boolean) || "";
}
