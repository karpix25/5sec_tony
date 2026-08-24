import { normalizeProjectDailyUsage } from "./daily-usage.js";
import { generationStages } from "./entities.js";
import { noAvatarCharacterId } from "./avatar-selection.js";
import { resolveAvatarEmotionSelection } from "./avatar-emotion.js";
import { createContentSlot, refreshContentSlotLayer } from "./content-rotation.js";
import { getCompositionInstruction, pickCompositionMode } from "./composition-modes.js";
import { getContentLayerInstruction } from "./content-layers.js";
import { createMeaningBrief, createUniversalSemanticPlan, scoreMeaningBrief } from "./meaning-engine.js";
import { createPaymentPlan, getScenarioVisualInstruction } from "./payment-plan.js";
import { buildDesignReferenceConsistencyInstructions } from "./design-style-lock.js";
import { buildProductProfile } from "./product-profile.js";
import { isPaymentProject } from "./project-content-intent.js";
import { createTopicCandidatePlan, pickTopicCandidate } from "./topic-candidates.js";
import { pickGenerationTopic } from "./generation-topic.js";
import { createHookIntelligence, formatHookIntelligencePrompt } from "./hook-intelligence.js";
import { createLayoutContentPlan, formatLayoutPlanPrompt } from "./layout-content-planner.js";
import { formatCreativeQualityPrompt } from "./creative-quality-validator.js";
import { createCuriosityContentPlan, formatFinalContentPrompt } from "./curiosity-content.js";
import { createUniqueJobId } from "./job-identity.js";
import { getReferenceFormatSignal, resolveGenerationFormat, resolvePointCountForFormat } from "./reference-format.js";
import { compactImagePromptSource, limitImagePrompt } from "./image-prompt-budget.js";
import { buildCreativeTeamImagePrompt, getCreativeTeamProductVisualMode } from "./creative-team-image-prompt.js";
import { formatPointCountInstruction, formatVisiblePointSource, getVisibleImagePoints } from "./visible-points.js";
import { createAvatarReservedZone, formatAvatarReservedZonePrompt } from "./avatar-overlay-zone.js";
import { formatCurrentDatePrompt } from "./current-date-context.js";
import { formatAvatarCornerCompositionPolicy } from "./image-composition-policy.js";
import { formatProductVisualContext, getProductVisualPromptPolicy, resolveProductVisualMode } from "./product-visual-policy.js";
import { getProductReferenceTransferInstruction } from "./product-reference-transfer.js";
import { createProductVisibilityDecision } from "./product-visibility-decision.js";
import { createPromptContract } from "./prompt-contract.js";
import { createGenerationAiTrace } from "./generation-ai-trace.js";
import { getGenerationInputReferences, getGenerationInputUrls } from "./generation-input-references.js";
import { repairVisibleTextContract } from "./design-text-contract.js";
import {
  getAiDepartmentContent,
  getAiDepartmentFormat,
  getAiDepartmentHook,
  getAiDepartmentPointCount,
  getAiDepartmentTopic,
  getAiDepartmentVisualObject,
  hasAiDepartmentBrief
} from "./ai-department-brief.js";
import {
  contentQualityRules,
  designReferenceRules,
  productDataRules,
  productVisibilityRules,
  russianImageTextRules,
  socialSafeZoneRules
} from "./image-prompt-rules.js";
export { getGenerationInputReferences, getGenerationInputUrls };
export function getProductsForProject(products, projectId) {
  return products.filter((product) => product.projectId === projectId);
}
export function buildImagePrompt({ project, product, reference, character, generationBrief = {}, freePrompt, existingJobs = [] }) {
  const brief = createAutoGenerationBrief({ project, product, reference, generationBrief, existingJobs });
  const inputReferences = getGenerationInputReferences({ reference, product, productVisibilityDecision: brief.productVisibilityDecision });
  const avatarSafeZone = createAvatarReservedZone({ character, ctaOverlay: project?.ctaOverlay });
  const promptContract = generationBrief.promptContract || createPromptContract({ brief, reference, inputReferences, avatarSafeZone });
  const avatarReservedZonePrompt = formatAvatarReservedZonePrompt(createAvatarReservedZone({
    character,
    ctaOverlay: project?.ctaOverlay
  }));
  const currentDatePrompt = formatCurrentDatePrompt();
  const creativeTeamPrompt = buildCreativeTeamImagePrompt(brief, { freePrompt, avatarReservedZonePrompt, currentDatePrompt, promptContract });
  if (creativeTeamPrompt) return creativeTeamPrompt;
  const pains = compactImagePromptSource(product.pains.join(", "), 700);
  const facts = compactImagePromptSource(product.facts.join("; "), 900);
  const forbidden = compactImagePromptSource(product.forbidden.join("; "), 700);
  const shouldShowProduct = brief.productVisualMode === "exact-product";
  const productRefs = shouldShowProduct ? compactImagePromptSource((product.references || []).map((item) => `${item.title}: ${compactImagePromptSource(item.promptComment || item.imageName, 280)}`).join("; "), 1100) : "";
  const productVisualContext = formatProductVisualContext(product, brief.productVisualMode, compactImagePromptSource);
  const remoteProductRefs = (product.references || []).filter((item) => isRemoteImageUrl(item.imageData)).length;
  const localProductRefs = (product.references || []).filter((item) => item.imageData && !isRemoteImageUrl(item.imageData)).length;
  const cornerCompositionPolicy = formatAvatarCornerCompositionPolicy({ productVisualMode: brief.productVisualMode, hasProductReference: remoteProductRefs + localProductRefs > 0 });
  const extra = freePrompt ? `Дополнительная задача: ${compactImagePromptSource(freePrompt, 600)}.` : "";
  const plan = createSemanticPlan({ project, product, brief });
  const profile = buildProductProfile({ project, product, insightMap: brief.productInsightMap });
  const visiblePoints = getVisibleImagePoints(plan.points, brief.format);
  const visiblePointCount = String(visiblePoints.length);
  const visiblePointSource = formatVisiblePointSource(visiblePoints);
  const designCopyPrompt = compactImagePromptSource(cleanDesignReferenceText(reference?.takeaways), 900);
  const fixedFontStyle = reference?.fontStyle || reference?.headlineStyle || "";
  const compositionInstruction = getCompositionInstruction(brief.compositionMode);
  const layoutContentInstruction = formatLayoutPlanPrompt(brief.layoutContentPlan);
  const hookIntelligenceInstruction = formatHookIntelligencePrompt(brief.hookIntelligence);
  const creativeQualityInstruction = formatCreativeQualityPrompt(brief.creativeQuality);
  const finalContentInstruction = formatFinalContentPrompt(brief.finalContent);
  return limitImagePrompt([
    "GPT Image 2: создай вертикальную рекламную инфографику 9:16.",
    "КОНТЕНТНЫЕ СЛОИ: ищи бытовые боли, лайфхаки, советы, привычки, ошибки, мифы и смежные ситуации вокруг продукта, а не только прямую рекламу.",
    "ЯЗЫК КАРТОЧКИ: пиши бытовым языком для широкой аудитории, примерно уровень 5 класса.",
    "КРИТИЧНО: если переданы reference images, использовать их как главный источник визуального дизайна: палитра, типографика, свет, контраст, форма карточек, материалы, фактуры и ритм.",
    "Дизайн-референс использовать как структуру и визуальный стиль; не копировать его текст, смысл, продукт, логотипы, персонажа или обещания.",
    ...designReferenceRules,
    ...buildDesignReferenceConsistencyInstructions(reference),
    ...socialSafeZoneRules,
    currentDatePrompt,
    avatarReservedZonePrompt,
    cornerCompositionPolicy,
    "Не добавлять аватара/персонажа в саму картинку. Персонаж будет наложен отдельно на этапе видео.",
    "Смыслы и формулировки создать только на основе компании, ЦА, выбранного продукта и брифа генерации.",
    compositionInstruction,
    layoutContentInstruction,
    hookIntelligenceInstruction,
    creativeQualityInstruction,
    finalContentInstruction,
    getContentLayerInstruction(brief.contentLayer),
    ...productVisibilityRules,
    getProductVisualPromptPolicy(brief.productVisualMode),
    getProductReferenceTransferInstruction({ remoteProductRefs, localProductRefs, productVisualMode: brief.productVisualMode }),
    productVisualContext,
    productRefs ? `Референсы продукта: ${productRefs}.` : "",
    ...productDataRules,
    ...contentQualityRules,
    ...russianImageTextRules,
    `Тема инфографики: ${brief.topic}.`,
    brief.hook ? `Главный хук: ${brief.hook}.` : "",
    "СМЫСЛОВОЙ ПЛАН ДЛЯ ТЕКСТА: используй только эти блоки, не добавляй случайные карточки, комиссии, балансы, интерфейсы, статусы и новые тезисы.",
    `Заголовок: ${plan.headline}.`,
    `Подзаголовок: ${plan.subhead}.`,
    `Смысловые блоки как сырье для текста, не готовая разметка: ${visiblePointSource}. Не выводить служебные разделители и не нумеровать автоматически 1/2/3/4.`,
    "CTA: не добавлять на изображение. Финальная картинка должна быть полезной карточкой без кнопки, без стрелки действия, без футера и без нижней рекламной или защитной плашки.",
    "Логика текста: каждый следующий пункт должен продолжать предыдущий. Не смешивай список задач, шаги процесса и преимущества в одном блоке.",
    "Reels-паттерн: один экран — одна мысль; хук читается за 1 секунду; визуал должен быть классификацией, сравнением, метафорой или чеклистом, а не случайным набором карточек.",
    formatPointCountInstruction(brief.format, visiblePointCount),
    `Главный визуальный объект: ${brief.visualObject}.`,
    getScenarioVisualInstruction(brief),
    reference?.id === "viral-pink-symptoms" ? "ОБЯЗАТЕЛЬНЫЙ СТИЛЬ РЕФЕРЕНСА: не делать чистый corporate SaaS poster. Нужна viral Reels-инфографика как референс: розово-персиковый фон, верхняя hot-pink glow-плашка с белым текстом и черной обводкой, большой serif-тезис ниже, плотная колонка коротких пунктов с 3D-иконками слева, крупный 3D-объект справа. Без персонажа в картинке; нижнюю часть держать чистой для будущего видео-оверлея." : "",
    `Tone of voice: ${project.toneOfVoice || "экспертный"}. Визуальный стиль брать из выбранного дизайн-референса, а не из текстового поля проекта.`,
    project.projectTheme ? `Тема проекта: ${compactImagePromptSource(project.projectTheme, 500)}.` : "",
    project.niche ? `Ниша: ${compactImagePromptSource(project.niche, 300)}.` : "",
    project.keyScenarios ? `Сценарные кластеры: ${compactImagePromptSource(project.keyScenarios, 650)}.` : "",
    project.audiencePains ? `Боли аудитории: ${compactImagePromptSource(project.audiencePains, 650)}.` : "",
    project.audienceDesires ? `Желания аудитории: ${compactImagePromptSource(project.audienceDesires, 550)}.` : "",
    project.audienceObjections ? `Возражения аудитории: ${compactImagePromptSource(project.audienceObjections, 550)}.` : "",
    project.allowedTriggers ? `Разрешенные триггеры: ${compactImagePromptSource(project.allowedTriggers, 500)}.` : "",
    project.forbiddenTriggers ? `Запрещенные триггеры: ${compactImagePromptSource(project.forbiddenTriggers, 500)}.` : "",
    project.hookAggression ? `Степень агрессивности хуков: ${compactImagePromptSource(project.hookAggression, 220)}.` : "",
    project.contentRestrictions ? `Контентные ограничения: ${compactImagePromptSource(project.contentRestrictions, 650)}.` : "",
    project.companyInfo ? `Компания: ${compactImagePromptSource(project.companyInfo, 700)}.` : "",
    project.companyAudience ? `ЦА компании: ${compactImagePromptSource(project.companyAudience, 600)}.` : "",
    project.restrictions ? `Ограничения проекта: ${compactImagePromptSource(project.restrictions, 650)}.` : "",
    formatProductInsightPrompt(profile),
    `Референс подачи: ${reference?.title || "лучший проектный инфографический стиль"}.`,
    designCopyPrompt ? `Дополнительная визуальная инструкция к копированию дизайна: ${designCopyPrompt}.` : "",
    reference?.avoidCopy ? `Что НЕ копировать из референса: ${compactImagePromptSource(reference.avoidCopy, 450)}.` : "",
    reference?.palette ? `Палитра как ориентир: ${compactImagePromptSource(reference.palette, 350)}.` : "",
    fixedFontStyle ? `ФИКСИРОВАННЫЙ ШРИФТ СТИЛЯ: во всех генерациях с этим дизайн-референсом использовать одну и ту же типографику: ${compactImagePromptSource(fixedFontStyle, 450)}. Не менять семейство, характер, вес, контраст и обводку шрифта между вариантами.` : "",
    reference?.headlineStyle ? `Стиль заголовка: ${compactImagePromptSource(reference.headlineStyle, 350)}.` : "",
    reference?.textDensity ? `Плотность текста: ${compactImagePromptSource(reference.textDensity, 220)}.` : "",
    "Аватар/персонаж: не рисовать и не встраивать в изображение.",
    `Боли: ${pains}. Оффер: ${product.offer}.`,
    `Факты, которые можно использовать: ${facts}.`,
    `Запрещено обещать: ${forbidden}.`,
    `Уровень продающего текста: ${brief.salesLevel}.`,
    brief.notes ? `Комментарий к генерации: ${brief.notes}.` : "",
    brief.aiPlan?.hookPsychology ? `Внутренняя логика хука: ${brief.aiPlan.hookPsychology}` : "",
    "Текст короткий, крупный, без мелкой каши. Не придумывай медицинские/финансовые гарантии. Не добавляй неуказанные проценты, комиссии, баланс карты или фейковые UI-данные.",
    "ПЕРЕД ОТВЕТОМ проверь: все слова, которые ты рисуешь на изображении, написаны по-русски; английский интерфейсный или служебный текст запрещен.",
    extra
  ].filter(Boolean).join(" "));
}
function formatProductInsightPrompt(profile) {
  if (!profile.insightMap?.id) return "";
  const zones = profile.insightMap.benefitZones
    .map((zone) => `${zone.pain} -> ${zone.habit} -> ${zone.safeFact}`)
    .join("; ");
  const habits = profile.insightMap.connectedHabits.join("; ");
  return [
    `КАРТА ПОЛЬЗЫ ПРОДУКТА: ${profile.insightMap.category}.`,
    zones ? `Смысловые зоны: ${zones}.` : "",
    habits ? `Смежные привычки и лайфхаки: ${habits}.` : "",
    "Используй эту карту, чтобы делать интересный полезный контент вокруг боли, а не только прямую рекламу продукта."
  ].filter(Boolean).join(" ");
}

export function createGenerationJob({ project, product, reference, character, audio, generationBrief, freePrompt, existingJobs = [] }) {
  const rawBrief = createAutoGenerationBrief({ project, product, reference, generationBrief, existingJobs });
  const suppliedContent = generationBrief?.contentScript || generationBrief?.plan || generationBrief?.aiPlan;
  const finalContent = repairVisibleTextContract(suppliedContent || rawBrief.finalContent, { fallbackHeadlines: [rawBrief.hook, rawBrief.topic, product.name] });
  const brief = { ...rawBrief, hook: finalContent.headline, finalContent, aiPlan: finalContent, contentScript: finalContent };
  const avatarEmotion = resolveAvatarEmotionSelection({
    project,
    topic: brief.topic,
    hook: brief.hook,
    brief,
    selectedCharacterId: character?.id || noAvatarCharacterId
  });
  const characterId = avatarEmotion.characterId || character?.id || noAvatarCharacterId;
  const selectedCharacter = project.characters?.find((item) => item.id === characterId) || character;
  const avatarSafeZone = createAvatarReservedZone({ character: selectedCharacter, ctaOverlay: project?.ctaOverlay });
  const inputReferences = getGenerationInputReferences({ reference, product, productVisibilityDecision: brief.productVisibilityDecision });
  const promptContract = generationBrief?.promptContract || createPromptContract({ brief, reference, inputReferences, avatarSafeZone });
  const prompt = buildImagePrompt({ project, product, reference, character: selectedCharacter, generationBrief: { ...brief, promptContract }, freePrompt, existingJobs });
  return {
    id: createUniqueJobId(existingJobs),
    createdAt: new Date().toISOString(),
    projectId: project.id,
    productId: product.id,
    productName: product.name,
    characterId,
    avatarVideoId: avatarEmotion.avatarVideoId,
    avatarEmotionName: avatarEmotion.avatarEmotionName,
    avatarEmotionSource: avatarEmotion.source,
    availableAvatarEmotions: avatarEmotion.availableAvatarEmotions.map(({ emotionName, videoId, characterId }) => ({ emotionName, videoId, characterId })),
    status: "queued",
    stage: generationStages[0],
    progress: 6,
    title: brief.finalContent?.headline || brief.hook,
    music: audio?.title || pickAudio(project),
    prompt,
    promptContract,
    imagePromptContract: promptContract,
    aiTrace: createGenerationAiTrace({ brief, promptContract, inputReferences }),
    referenceId: reference?.id || "",
    referenceTitle: reference?.title || "",
    inputUrls: inputReferences.map((item) => item.url),
    inputRefs: inputReferences.map(({ role, title, isLocalData }) => ({ role, title, isLocalData })),
    outputType: "final-video",
    finalVideoUrl: "",
    finalVideoHasAudio: false,
    yandexDiskRequired: Boolean(project.yandexDiskFolder),
    topic: brief.topic,
    semanticKey: brief.semanticKey,
    meaningPatternId: brief.meaningPatternId,
    hookIntelligence: brief.hookIntelligence,
    layoutContentPlan: brief.layoutContentPlan,
    creativeQuality: brief.creativeQuality,
    aiPlan: brief.aiPlan, productFact: brief.productFact, curiosityAngle: brief.curiosityAngle, finalContent: brief.finalContent,
    productVisualMode: brief.productVisualMode,
    productVisibilityDecision: brief.productVisibilityDecision,
    avatarSafeZone,
    attentionMap: brief.attentionMap || null,
    attentionFrame: brief.attentionFrame || brief.attentionMap?.attentionFrame || "",
    creativeBrief: brief.creativeBrief || null,
    contentScript: brief.contentScript || null,
    visualBrief: brief.visualBrief || null,
    imagePromptPackage: brief.imagePromptPackage || null,
    qaReview: brief.qaReview || brief.safetyReview || brief.qualityChecks || null,
    compositionMode: brief.compositionMode?.id || "",
    diversitySlot: brief.diversitySlot,
    contentLayerId: brief.contentLayerId,
    format: brief.format
  };
}

function isRemoteImageUrl(value) { return /^https?:\/\//.test(String(value || "")); }

function cleanDesignReferenceText(value) {
  return String(value || "")
    .split(/(?<=[.!?])\s+|\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/аватар|персонаж|человек|стикер|sticker/i.test(line))
    .map((line) => line.replace(/\bsafe\s*zone\b/gi, "рабочая зона кадра"))
    .join(" ");
}

export function createAutoGenerationBrief({ project, product, reference, generationBrief = {}, existingJobs = [] }) {
  const aiDepartmentMode = hasAiDepartmentBrief(generationBrief);
  const slot = generationBrief.diversitySlot
    ? refreshContentSlotLayer(generationBrief.diversitySlot, { project, product, existingJobs })
    : createContentSlot({ project, product, existingJobs });
  const topicCandidate = !aiDepartmentMode && !slot.lockTopic && !generationBrief.hook && !isPaymentProject(project, product)
    ? pickTopicCandidate({ project, product, existingJobs, insightMap: generationBrief.productInsightMap })
    : null;
  const topicCandidatePlan = !generationBrief.aiPlan && topicCandidate
    ? createTopicCandidatePlan({ project, product, candidate: topicCandidate })
    : null;
  const lockedTopic = slot.lockTopic ? slot.topic : "";
  const lockedHook = slot.lockTopic ? slot.hook : "";
  const lockedFormat = slot.lockTopic ? slot.format : "";
  const seedTopic = pickGenerationTopic({
    suppliedTopic: generationBrief.topic,
    candidateTopic: topicCandidate?.topic,
    lockedTopic,
    slot,
    existingJobs
  });
  const generationSeed = {
    ...generationBrief,
    diversitySlot: slot,
    topic: aiDepartmentMode ? getAiDepartmentTopic(generationBrief) : seedTopic,
    hook: aiDepartmentMode ? getAiDepartmentHook(generationBrief) : generationBrief.hook || topicCandidate?.hook || lockedHook,
    format: aiDepartmentMode
      ? getAiDepartmentFormat(generationBrief, lockedFormat)
      : resolveGenerationFormat({ reference, requestedFormat: generationBrief.format, candidateFormat: topicCandidate?.format, lockedFormat }),
    aiPlan: generationBrief.aiPlan || topicCandidatePlan || undefined
  };
  const aiContent = aiDepartmentMode ? getAiDepartmentContent(generationBrief) : null;
  const meaning = aiDepartmentMode
    ? null
    : createMeaningBrief({ project, product, reference, generationBrief: generationSeed, existingJobs });
  const scenario = generationBrief.topic ? "" : pickNextScenario({ project, product, existingJobs });
  const desire = firstLine(project.audienceDesires) || product.offer || product.name;
  const fact = firstListItem(product.facts) || product.description || project.projectTheme;
  const topic = aiDepartmentMode
    ? generationSeed.topic
    : generationSeed.topic || meaning.topic || slot.topic || scenario || project.projectTheme || `${product.name}: полезная инфографика`;
  const paymentHook = isPaymentProject(project, product) ? buildAutoHook({ project, product, topic, fact, desire, existingJobs }) : "";
  const hook = aiDepartmentMode
    ? generationSeed.hook
    : generationSeed.hook || paymentHook || meaning.hook || slot.hook || buildAutoHook({ project, product, topic, fact, desire, existingJobs });
  const hookPointCount = getHookPointCount(hook);
  const profile = buildProductProfile({ project, product, insightMap: generationBrief.productInsightMap });
  const hookIntelligence = createHookIntelligence(hook);
  const layoutContentPlan = createLayoutContentPlan(reference, hookIntelligence);
  const format = generationSeed.format || meaning?.format || slot.format || pickFormat(project, reference);
  const semanticKey = generationBrief.semanticKey || slot.id;
  const creativeTeamVisualMode = getCreativeTeamProductVisualMode(generationBrief);
  const requestedProductVisualMode = generationBrief.productVisibilityDecision?.productVisualMode
    || generationBrief.productVisibilityDecision?.mode
    || generationBrief.productVisualMode
    || creativeTeamVisualMode
    || resolveProductVisualMode({ project, product, generationBrief: { ...generationSeed, topic, hook }, existingJobs });
  const productVisibilityDecision = createProductVisibilityDecision({
    project,
    product,
    generationBrief: {
      ...generationSeed,
      topic,
      hook,
      productVisualMode: requestedProductVisualMode,
      productVisibilityDecision: generationBrief.productVisibilityDecision
    },
    existingJobs
  });
  const productVisualMode = productVisibilityDecision.productVisualMode || requestedProductVisualMode;
  const editorialBrief = { ...generationSeed, topic, hook, format, semanticKey, productInsightMap: profile.insightMap, productVisualMode };
  const editorial = aiDepartmentMode
    ? {
        productFact: { fact: generationBrief.productFact || "", situation: generationBrief.scrollStopperAngle || "", action: generationBrief.productPositiveBridge || "" },
        curiosityAngle: { conflict: generationBrief.scrollStopperAngle || "", fact: generationBrief.productFact || "", situation: "", promise: "", question: "" },
        finalContent: aiContent,
        creativeQuality: generationBrief.creativeQuality || generationBrief.qualityChecks || {}
      }
    : createCuriosityContentPlan({ project, product, layoutPlan: layoutContentPlan, hookIntelligence, existingJobs, brief: editorialBrief });
  const creativeQuality = editorial.creativeQuality;
  const brief = {
    topic,
    hook,
    format,
    pointCount: aiDepartmentMode
      ? getAiDepartmentPointCount(generationBrief, resolvePointCountForFormat({ format, hookCount: hookPointCount, requested: generationBrief.pointCount, product }))
      : resolvePointCountForFormat({ format, hookCount: hookPointCount, requested: generationBrief.pointCount, product }),
    visualObject: productVisualMode === "no-package"
      ? getAiDepartmentVisualObject(generationBrief, generationBrief.visualObject || slot.visualObject || reference?.visualObject || "жизненная ситуация или абстрактная метафора без товара")
      : getAiDepartmentVisualObject(generationBrief, generationBrief.visualObject || profile.primaryVisual || meaning?.visualObject || slot.visualObject || reference?.visualObject || product.components || product.name),
    cta: generationBrief.cta || "",
    salesLevel: generationBrief.salesLevel || "expert",
    notes: generationBrief.notes || meaning?.notes || `Контентный слот: ${slot.angle || slot.id}. Автоматически собрать смыслы из проекта, ЦА, продукта и выбранного референса.`,
    semanticKey,
    meaningPatternId: meaning?.pattern?.id || "",
    hookIntelligence,
    layoutContentPlan,
    creativeQuality,
    productFact: editorial.productFact,
    curiosityAngle: editorial.curiosityAngle,
    finalContent: editorial.finalContent,
    meaningScore: meaning ? scoreMeaningBrief({ brief: meaning, project }) : 0,
    productPassport: generationBrief.productPassport || null,
    designFormatBrief: generationBrief.designFormatBrief || null,
    creativeBrief: generationBrief.creativeBrief || null,
    contentScript: aiDepartmentMode
      ? aiContent
      : generationBrief.contentScript || null,
    visualBrief: generationBrief.visualBrief || null,
    imagePromptPackage: generationBrief.imagePromptPackage || null,
    topicCandidate,
    diversitySlot: slot,
    contentLayer: slot.contentLayer || generationBrief.contentLayer || null,
    contentLayerId: slot.contentLayer?.id || generationBrief.contentLayerId || "",
    compositionMode: generationBrief.compositionMode || pickCompositionMode({
      format: format || meaning?.format || slot.format || pickFormat(project, reference),
      existingJobs
    }),
    productInsightMap: profile.insightMap,
    aiPlan: editorial.finalContent,
    productVisualMode,
    productVisibilityDecision,
    topicCluster: generationBrief.topicCluster || null,
    promptContract: generationBrief.promptContract || null,
    imagePromptContract: generationBrief.imagePromptContract || null,
    attentionMap: generationBrief.attentionMap || null,
    qaReview: generationBrief.qaReview || null
  };
  return brief;
}
function getHookPointCount(value) {
  const match = String(value || "").match(/\b([3-9])\b/);
  return match ? match[1] : "";
}
export function createSemanticPlan({ project, product, brief }) {
  if (isPaymentProject(project, product)) return createPaymentPlan({ product, brief });
  return createUniversalSemanticPlan({ project, product, brief });
}

export function advanceJob(job) {
  const index = generationStages.indexOf(job.stage);
  const nextStage = generationStages[Math.min(index + 1, generationStages.length - 1)];
  const done = nextStage === "export";
  return {
    ...job,
    stage: nextStage,
    status: done ? "done" : nextStage === "approval" ? "review" : "running",
    progress: done ? 100 : Math.min(95, job.progress + 22)
  };
}

export function getLimitState(project) {
  const normalizedProject = normalizeProjectDailyUsage(project);
  const daily = getSingleLimitState(normalizedProject.dailyLimit, normalizedProject.usedToday);
  const total = getSingleLimitState(normalizedProject.projectLimit ?? normalizedProject.dailyLimit, normalizedProject.usedTotal ?? normalizedProject.usedToday);
  const remaining = Math.min(daily.remaining, total.remaining);
  const percent = Math.max(daily.percent, total.percent);
  return { remaining, percent, isNearLimit: percent >= 80, daily, total };
}

function getSingleLimitState(limitValue, usedValue) {
  const limit = Math.max(1, Number(limitValue || 0));
  const used = Math.max(0, Number(usedValue || 0));
  const remaining = Math.max(0, limit - used);
  const percent = Math.min(100, Math.round((used / limit) * 100));
  return { limit, used, remaining, percent, isNearLimit: percent >= 80 };
}
function buildAutoHook({ project, product, topic, fact, desire, existingJobs = [] }) {
  return pickUniqueHook([
    topic,
    fact,
    desire,
    firstLine(project.audiencePains),
    firstLine(project.keyScenarios),
    firstListItem(product.pains),
    product.offer,
    product.description,
    product.name
  ], existingJobs);
}

function pickNextScenario({ project, product, existingJobs = [] }) {
  const candidates = [
    ...lines(project.keyScenarios),
    ...lines(project.audiencePains),
    ...lines(project.audienceDesires),
    ...lines(project.audienceObjections),
    ...(product.pains || []),
    ...(product.facts || [])
  ].filter(Boolean);
  if (!candidates.length) return firstLine(project.projectTheme) || firstListItem(product.pains);
  const used = new Set(existingJobs.map((job) => normalizeText(job.topic || job.title)));
  return candidates.find((item) => !used.has(normalizeText(item)))
    || candidates[existingJobs.length % candidates.length];
}

function pickUniqueHook(candidates, existingJobs) {
  const used = new Set(existingJobs.map((job) => normalizeText(job.title)));
  const cleanCandidates = candidates.map((item) => String(item || "").trim()).filter(Boolean);
  return cleanCandidates.find((item) => !used.has(normalizeText(item)))
    || cleanCandidates[existingJobs.length % cleanCandidates.length]
    || "Полезная тема для вашей аудитории";
}

function lines(value) {
  return String(value || "").split(/\n|;/).map((item) => item.trim()).filter(Boolean);
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function pickFormat(project, reference) {
  const source = `${project.allowedTriggers || ""} ${project.keyScenarios || ""}`.toLowerCase();
  const referenceFormat = getReferenceFormatSignal(reference);
  if (referenceFormat) return referenceFormat;
  if (/ошибк/.test(source)) return "mistake-solution";
  if (/чеклист|провер/.test(source)) return "checklist";
  if (/сравн/.test(source)) return "comparison";
  return reference?.layoutType || "checklist";
}
function firstLine(value) {
  return String(value || "").split(/\n/).map((item) => item.trim()).find(Boolean) || "";
}
function firstListItem(value) { return Array.isArray(value) ? value.find(Boolean) || "" : firstLine(value); }
function pickAudio(project) {
  return project.audioLibrary?.[0]?.title || "Project audio random";
}
