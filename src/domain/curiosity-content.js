import { validateCreativeBrief } from "./creative-quality-validator.js";
import { getProductContentFocus } from "./product-content-focus.js";
import { buildProductProfile } from "./product-profile.js";
import { formatHeadlineStyleInstruction } from "./headline-style-contract.js";
import { getVisibleTextContractViolations, isGenericProductDescriptor } from "./design-text-contract.js";

export function createCuriosityContentPlan({ project, product, brief, layoutPlan, hookIntelligence, existingJobs = [] }) {
  const productFact = createProductFact({ project, product, brief });
  const curiosityAngle = createCuriosityAngle({ brief, productFact, hookIntelligence });
  const finalContent = createFinalContent({ project, product, brief, productFact, curiosityAngle, layoutPlan });
  const creativeQuality = validateCreativeBrief({
    draft: {
      ...brief,
      productFact: productFact.fact,
      scrollStopperAngle: curiosityAngle.conflict,
      finalContent,
      plan: finalContent
    },
    project,
    product,
    layoutPlan,
    hookIntelligence,
    existingJobs
  });
  return { productFact, curiosityAngle, finalContent, creativeQuality };
}

export function formatFinalContentPrompt(content) {
  if (!content?.headline) return "";
  return [
    "ФИНАЛЬНЫЙ ТЕКСТ ДЛЯ КАРТИНКИ: используй этот текст как контракт, не придумывай новые темы и пункты.",
    formatHeadlineStyleInstruction(),
    `Заголовок: ${content.headline}.`,
    `Подзаголовок: ${content.subhead}.`,
    `Блоки: ${(content.points || []).join(" | ")}.`,
    "Можно менять переносы строк под дизайн, но нельзя заменять смысл общими советами."
  ].join(" ");
}

function createProductFact({ project, product, brief }) {
  const profile = buildProductProfile({ project, product, insightMap: brief.productInsightMap });
  const focus = getProductContentFocus({ project, product });
  const factInput = asFactObject(brief.productFact || brief.aiPlan?.productFact);
  return {
    fact: pickConcrete([
      factInput.fact,
      brief.productFact,
      brief.aiPlan?.fact,
      profile.insightMap?.safeFacts?.[0],
      focus.fact,
      profile.primaryProof,
      ...profile.proofPoints,
      product.components,
      product.description
    ], product.name),
    situation: pickConcrete([
      factInput.situation,
      brief.scrollStopperAngle,
      brief.aiPlan?.subhead,
      focus.pain,
      profile.primaryPain,
      ...profile.painMap,
      focus.context
    ], product.name),
    action: pickConcrete([
      factInput.action,
      brief.productPositiveBridge,
      inferActionFromPlan(brief.aiPlan),
      focus.action,
      profile.safeClaims[0],
      product.offer
    ], product.name)
  };
}

function createCuriosityAngle({ brief, productFact, hookIntelligence }) {
  const conflict = pickConcrete([
    brief.scrollStopperAngle,
    brief.curiosityAngle?.conflict,
    `${productFact.situation}: ${productFact.fact}`
  ], "");
  return {
    conflict,
    fact: productFact.fact,
    situation: productFact.situation,
    promise: hookIntelligence?.hookPromise || "зритель поймет конкретную деталь, которую легко проверить",
    question: buildQuestion(productFact)
  };
}

function createFinalContent({ project, product, brief, productFact, curiosityAngle, layoutPlan }) {
  const aiPlan = normalizeAiPlan(brief.aiPlan);
  const points = aiPlan.points.length
    ? aiPlan.points
    : createFallbackPoints({ productFact, curiosityAngle, layoutPlan });
  const layoutPoints = expandPointsForLayout(uniquePoints(points), { productFact, curiosityAngle, layoutPlan });
  const sourceHeadline = aiPlan.headline || brief.hook;
  return sanitizeVisibleContent({
    headline: cleanHeadline(sourceHeadline, productFact, curiosityAngle, brief, project),
    subhead: cleanSentence(aiPlan.subhead || curiosityAngle.conflict),
    points: fitPointCount(layoutPoints, brief.pointCount),
    disclaimer: "",
    layoutType: layoutPlan?.layoutType || "",
    curiosityAngle
  }, { project, product, brief, productFact, curiosityAngle, sourceHeadline, productVisualMode: brief.productVisualMode });
}

function normalizeAiPlan(plan) {
  return {
    headline: cleanSentence(plan?.headline),
    subhead: cleanSentence(plan?.subhead),
    points: Array.isArray(plan?.points) ? plan.points.map(cleanSentence).filter(Boolean) : []
  };
}

function createFallbackPoints({ productFact, curiosityAngle, layoutPlan }) {
  const base = [
    productFact.situation,
    productFact.fact,
    productFact.action,
    curiosityAngle.question
  ];
  if (layoutPlan?.layoutType === "beauty-grid") {
    return [
      `Ситуация: ${productFact.situation}`,
      `Факт: ${productFact.fact}`,
      `Шаг: ${productFact.action}`,
      curiosityAngle.question
    ];
  }
  if (layoutPlan?.layoutType === "fact-badges") {
    return [
      `Кажется: достаточно общего совета`,
      `На деле: ${productFact.fact}`,
      `Проверьте: ${productFact.action}`,
      `Риск: решить по впечатлению, а не по контексту`
    ];
  }
  return base;
}

function expandPointsForLayout(points, { productFact, curiosityAngle, layoutPlan }) {
  if (layoutPlan?.layoutType !== "ranking_leaderboard") return points;
  return uniquePoints([
    ...points,
    `1. Сценарий: ${productFact.situation}`,
    `2. Факт: ${productFact.fact}`,
    `3. Проверка: ${productFact.action}`,
    `4. Контраст: ожидание против реального сценария`,
    `5. Сигнал: что видно до покупки`,
    `6. Ошибка: решать только по обещанию`,
    `7. Польза: ${curiosityAngle.question}`,
    `8. Выбор: спокойная проверка важнее громкого claims`
  ]);
}

function cleanHeadline(value, productFact, angle, brief, project) {
  const source = cleanSentence(value).replace(/\bn\b/gi, "5").replace(/\([^)]*\)/g, "").trim();
  if (isGoodHeadline(source)) return finalizeHeadline(source);
  return finalizeHeadline(buildContextHeadline({ source, productFact, angle, brief, project }));
}

function buildContextHeadline({ source, productFact, angle, brief, project }) {
  const subjects = [
    project?.projectTheme,
    brief?.diversitySlot?.contentLayer?.subject,
    brief?.topic,
    source
  ].map(compactHeadlineSubject).filter(Boolean);
  const shortSubject = subjects
    .filter((item) => item.split(/\s+/).length <= 2)
    .sort((left, right) => right.split(/\s+/).length - left.split(/\s+/).length)[0];
  if (shortSubject) {
    const subjectVariants = [`${shortSubject}?`];
    return subjectVariants
      .map(finalizeHeadline)
      .find((item) => isGoodHeadline(item)) || "";
  }

  const candidate = subjects.concat([productFact.action, angle.question])
    .map(compactHeadlineSubject)
    .find((item) => isGoodHeadline(finalizeHeadline(item)));
  return candidate || "";
}

function buildQuestion(fact) {
  return `Что проверить первым: ${fact.action}`;
}

function inferActionFromPlan(plan) {
  const points = Array.isArray(plan?.points) ? plan.points : [];
  return points.find((point) => /проверь|сравни|убери|сначала|выбери|уточни|смотри|не смешивай/i.test(point)) || "";
}

function asFactObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function pickConcrete(items, productName) {
  const blocked = normalizeCuriosityText(productName);
  return items
    .flatMap((item) => String(item || "").split(/\n|;/))
    .map(cleanSentence)
    .find((item) => item && normalizeCuriosityText(item) !== blocked && !isVague(item))
    || "одна проверяемая деталь меняет итог";
}

function isGoodHeadline(value) {
  const headline = finalizeHeadline(value);
  return !getVisibleTextContractViolations({ contentScript: { headline } }).length;
}

function finalizeHeadline(value) {
  const headline = limitWords(value, 6);
  const normalized = headline && headline[0].toLocaleUpperCase("ru-RU") + headline.slice(1);
  if (normalized.split(/\s+/).filter(Boolean).length === 3 && !/[?!:—–-]/.test(normalized)) return `${normalized}?`;
  return normalized;
}

function compactHeadlineSubject(value) {
  const clean = cleanSentence(value);
  const words = clean.split(/\s+/).filter(Boolean);
  return words.length > 6 ? words.slice(0, 3).join(" ") : clean;
}

function isVague(value) {
  return /без медицинских обещаний|без обещаний|делаем акцент|акцент на|не заменяет|упоминаем|показываем сценарии|поддержк[ау]$|одна проверяемая деталь/i.test(value);
}

function uniquePoints(points) {
  const seen = new Set();
  return points.map(cleanSentence).filter((point) => {
    const key = normalizeCuriosityText(point);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sanitizeVisibleContent(content, context) {
  const points = (content.points || []).map((point) => sanitizeVisiblePoint(point, context));
  const cleanPoints = ensureMinimumVisiblePoints(uniquePoints(points), context);
  const sourceHeadline = context.sourceHeadline || content.headline;
  const headline = sanitizeHeadline(content.headline, context);
  return {
    ...content,
    headline,
    subhead: sanitizeSubhead(content.subhead, { ...context, headline, sourceHeadline, points: cleanPoints }),
    points: cleanPoints
  };
}

function sanitizeHeadline(value, context) {
  const clean = sanitizeVisiblePoint(value, context);
  if (/(на|про|о)\s+непонятн|:\s*непонятн/i.test(clean)) {
    return finalizeHeadline(buildContextHeadline({
      source: "",
      productFact: context.productFact,
      angle: context.curiosityAngle,
      brief: context.brief,
      project: context.project
    }));
  }
  return clean;
}

function sanitizeVisiblePoint(value, context) {
  const clean = sanitizeNoPackageProductText(removeTechnicalLabel(cleanSentence(value)), context);
  if (!hasRestrictedVisibleClaim(clean, context)) return clean;
  return safeVisibleReplacement(context);
}

function sanitizeSubhead(value, context) {
  const clean = sanitizeVisiblePoint(value, context);
  if ([context.headline, context.sourceHeadline].some((headline) => isDuplicateVisibleLine(clean, headline))) {
    return context.points.find((point) => !isDuplicateVisibleLine(point, context.headline)) || safeVisibleReplacement(context);
  }
  return clean;
}

function isDuplicateVisibleLine(value, compareTo) {
  const left = normalizeCuriosityText(value);
  const right = normalizeCuriosityText(compareTo);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

function sanitizeNoPackageProductText(value, { productVisualMode, project, product, productFact }) {
  if (productVisualMode !== "no-package") return value;
  const productTerms = [project?.name, product?.name, product?.components]
    .flatMap((item) => String(item || "").split(/\s+|\+/))
    .map((item) => item.trim())
    .filter((item) => item.length >= 4 && !isGenericProductDescriptor(item));
  const pattern = productTerms.length ? new RegExp(productTerms.map(escapeRegExp).join("|"), "gi") : null;
  const withoutProduct = pattern ? value.replace(pattern, "").replace(/\s{2,}/g, " ").trim() : value;
  if (/упаков|этикет|флакон|бутыл|баноч|банка|sku|packshot|bottle|package|label|jar/i.test(withoutProduct)) {
    return safeVisibleReplacement({ product, productFact });
  }
  return withoutProduct || safeVisibleReplacement({ product, productFact });
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function removeTechnicalLabel(value) {
  return value.replace(/^(знакомая ситуация|что обычно упускают|проверяемая деталь|что сделать сегодня|на что смотреть|ситуация|факт|шаг|кажется|на деле|проверьте|риск|сигнал|ошибка|ожидание|причина|контекст|проверка|полезный шаг)\s*[:—-]\s*/i, "");
}

function hasRestrictedVisibleClaim(value, { project, product }) {
  const text = value.toLowerCase();
  const source = `${project?.name || ""} ${project?.projectTheme || ""} ${product?.name || ""} ${product?.description || ""}`.toLowerCase();
  const beauty = /космет|сыворот|кожа|уход|гиалурон|коллаген/.test(source);
  const wellness = /бад|wellness|нутрицевтик|витамин|хлорофилл|магни/.test(source);
  if (beauty && /гарант|мгнов|моменталь|леч|восстанавливает|увлажняющ.*фактор|минус\s*\d+/.test(text)) return true;
  if (wellness && /гарант|леч|детокс|похуд|диагноз|очищ.*кож|восстанавливает/.test(text)) return true;
  return false;
}

function safeVisibleReplacement({ product, productFact }) {
  const source = `${product?.components || ""} ${product?.name || ""}`.toLowerCase();
  if (/гиалурон|коллаген/.test(source)) {
    return "Смотрите на состав, регулярность и ощущения после нанесения";
  }
  return productFact.action || productFact.fact || "Смотрите на проверяемую деталь, а не на обещание";
}

function ensureMinimumVisiblePoints(points, context) {
  const { productFact } = context;
  const extra = [
    productFact.action,
    productFact.fact,
    "Сравните ожидание, состав и сценарий применения",
    "Один спокойный шаг лучше громкого обещания"
  ].map((point) => sanitizeNoPackageProductText(cleanSentence(point), context));
  return uniquePoints([...points, ...extra]).slice(0, Math.max(4, points.length));
}

function fitPointCount(points, count) {
  const limit = Math.max(3, Math.min(12, Number(count) || 5));
  return points.slice(0, limit);
}

function cleanSentence(value) {
  return String(value || "").replace(/\s+/g, " ").replace(/[.。]+$/g, "").trim();
}

function limitWords(value, max) {
  const words = cleanSentence(value).split(/\s+/).filter(Boolean);
  return words.length > max ? words.slice(0, max).join(" ") : words.join(" ");
}

function normalizeCuriosityText(value) {
  return String(value || "").toLowerCase().replace(/[^a-zа-я0-9ё]+/gi, " ").trim();
}
