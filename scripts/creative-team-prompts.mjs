import { humanizedPointRule, modernFormatOptions, modernImageFormatRule, oldFormatShellBan } from "../src/domain/generation-format-contract.js";
import { createCreativeTeamPayload } from "../src/domain/creative-team-payload.js";
import { createProductPassportInput } from "../src/domain/product-passport-input.js";
import { getDesignTextContractViolations } from "../src/domain/design-text-contract.js";
import { formatCurrentDatePrompt } from "../src/domain/current-date-context.js";
import { clickbaitHeadlineRules, hookPayoffRules, simpleAudienceLanguageRules, viralReelsHookRules } from "../src/domain/headline-style-contract.js";
import { hasUsefulDesignAnalysis, hasUsefulProductPassport, normalizeDesignAnalysis, normalizeProductAiPassport } from "../src/domain/ai-artifacts.js";
import { socialSafeZonePixelRules } from "../src/domain/social-safe-zone-contract.js";
import { ruTextEditorialRules } from "../src/domain/ru-text-guidance.js";
import { formatComplianceInstruction } from "./creative-team-format-compliance.mjs";
import { isJsonDraftFormatError } from "./openrouter-response.mjs";

const commonRoleRules = [
  "Ты часть креативной команды для коротких вертикальных соцсетей: Reels, TikTok, Shorts.",
  ...ruTextEditorialRules,
  formatCurrentDatePrompt(),
  "Пиши по-русски. Возвращай только валидный JSON без markdown.",
  "Не выдумывай факты, цифры, состав, гарантии, юридические или медицинские обещания.",
  "Если данных мало, помечай гипотезы как гипотезы.",
  "Не делай рекламную воду. Каждый вывод должен помогать создать контент, который человек захочет досмотреть, сохранить или отправить.",
  "Ты senior SMM strategist и viral content marketer 2026: строишь вирусный смысл из минимальных входных данных оператора.",
  "Главная ценность инфографики — интересный факт или жизненное наблюдение; зритель должен подумать: полезно, сохраню или отправлю другу.",
  "Работай в несколько слоев: боль аудитории, бытовая ситуация, лайфхак или совет, смежная тема вокруг продукта, мягкая роль продукта.",
  "Тема не обязана напрямую повторять продукт: можно идти рядом через привычки, ошибки, режим, контекст, выбор, мифы и смежные ситуации.",
  "Если продукт является решением, сначала подними боль, которую он закрывает, и только потом мягко покажи продукт как один из понятных следующих шагов.",
  "Не делай пустые команды вроде 'проверьте', 'изучите', 'обратите внимание': каждый пункт должен содержать конкретный факт, причину или пример.",
  "Не смешивай в одной карточке оплату рекламного кабинета, ВПН, нейросети, поддержку и заявки.",
  "Не называй продукт лекарством, препаратом, лечением, терапией или медицинским средством, если это БАД, wellness, косметика или нутрицевтик.",
  "Анкета product — источник истины. Поля forbidden, restrictions и contentRestrictions — внутренние стоп-правила.",
  "Не выбирай упаковку как visualObject по умолчанию. Продукт не должен быть в каждом посте.",
  "Хук должен быть понятным без расшифровки ниже.",
  ...clickbaitHeadlineRules,
  ...simpleAudienceLanguageRules,
  ...viralReelsHookRules,
  ...hookPayoffRules,
  "CTA не нужен на изображении.",
  "Делай shareable value: мини-диагностика, ошибка ожиданий, сравнение подходов, простая привычка или проверяемая деталь.",
  "Финальная самопроверка маркетолога: короткий конкретный заголовок, связанные блоки, полезный смысл без покупки, нет запрещенных обещаний.",
  "Тон может быть триггерный, актуальный, спорный, но не порочащий репутацию автора. Правда, реальные факты, без лжи.",
  "Спорность строить через честный конфликт: популярное обещание против реальной привычки, ожидание против ограничений, тренд против здравого смысла, громкий совет против проверяемой детали.",
  "Не делай утверждения, которые нельзя защитить фактами."
];

const roleSystemPrompt = "Ты senior-участник AI-креативной команды. Пиши по-русски. Верни только JSON без markdown.";
const maxRoleJsonAttempts = 3;
const designReferenceFidelityRules = [
  "DESIGN REFERENCE FIDELITY GATE: перед финальным рендером сравни prompt с designReference; если не узнается тот же skeleton, palette, typography hierarchy, card rhythm and object geometry, перепиши prompt ближе к референсу.",
  "Сохраняй macro-layout дизайн-референса: крупные зоны, направление чтения, повторяемые формы, пропорции блоков, декоративный язык и визуальный вес. Не подменяй funnel/chart/poster/comparison/card grid обычным generic checklist."
];

export async function runCreativeTeamBrief({ token, body, model, referenceModel, callOpenRouter, parseJsonDraft }) {
  body = createCreativeTeamPayload(body);
  const productPassport = hasUsefulProductPassport(body.productPassport || body.product?.aiPassport)
    ? { productPassport: normalizeProductAiPassport(body.productPassport || body.product.aiPassport) }
    : await runRole({ token, model, callOpenRouter, parseJsonDraft, instruction: productPassportInstruction(body) });
  const designFormatBrief = hasUsefulDesignAnalysis(body.designAnalysis || body.activeDesignReference?.designAnalysis || body.reference?.designAnalysis)
    ? { designFormatBrief: normalizeDesignAnalysis(body.designAnalysis || body.activeDesignReference?.designAnalysis || body.reference.designAnalysis) }
    : await runRole({ token, model: referenceModel || model, callOpenRouter, parseJsonDraft, instruction: designFormatBriefInstruction(body, productPassport), imageUrls: body.designReferenceImageUrls });
  const normalizedDesignFormatBrief = resolveDesignFormatBrief(designFormatBrief.designFormatBrief || designFormatBrief, body);
  const attentionMap = await runRole({ token, model, callOpenRouter, parseJsonDraft, instruction: attentionMapInstruction(body, productPassport, designFormatBrief) });
  const creativeBrief = await runRole({ token, model, callOpenRouter, parseJsonDraft, instruction: creativeBriefInstruction(body, productPassport, attentionMap, designFormatBrief) });
  const hookSet = await runRole({ token, model, callOpenRouter, parseJsonDraft, instruction: hookProducerInstruction(body, productPassport, creativeBrief) });
  const contentScript = await runRole({ token, model, callOpenRouter, parseJsonDraft, instruction: scriptwriterInstruction(body, productPassport, creativeBrief, hookSet, designFormatBrief) });
  const formatCompliance = await runRole({ token, model, callOpenRouter, parseJsonDraft, instruction: formatComplianceInstruction({ commonRules: commonRoleRules, productPassport, creativeBrief, contentScript, designFormatBrief }) });
  const complianceScript = getCompliantContentScript(contentScript, formatCompliance);
  const contractViolations = getDesignTextContractViolations({ contentScript: complianceScript, designFormatBrief: normalizedDesignFormatBrief });
  const compliantScript = complianceScript;
  const visualBrief = await runRole({ token, model, callOpenRouter, parseJsonDraft, instruction: artDirectorInstruction(body, productPassport, creativeBrief, compliantScript, designFormatBrief) });
  const safetyReview = await runRole({ token, model, callOpenRouter, parseJsonDraft, instruction: safetyEditorInstruction(body, productPassport, creativeBrief, compliantScript, visualBrief) });
  const safetyScript = getSafetyFixedContentScript(compliantScript, safetyReview);
  const safetyContractViolations = getDesignTextContractViolations({ contentScript: safetyScript, designFormatBrief: normalizedDesignFormatBrief });
  const finalScript = safetyScript;
  const finalSafetyReview = withFinalContentScript(safetyReview, finalScript, safetyContractViolations);
  const imagePromptPackage = await runRole({ token, model, callOpenRouter, parseJsonDraft, instruction: imagePromptEngineerInstruction(body, productPassport, creativeBrief, finalScript, visualBrief, finalSafetyReview, designFormatBrief) });
  return flattenCreativeTeamDraft({ productPassport, designFormatBrief, attentionMap, creativeBrief, hookSet, contentScript: finalScript, formatCompliance, textContractViolations: [...new Set([...contractViolations, ...safetyContractViolations])], visualBrief, safetyReview: finalSafetyReview, imagePromptPackage, body });
}

export function humanizeTextInstruction(body) {
  return JSON.stringify({
    task: "Перепиши финальный текст инфографики человеческим массовым языком перед генерацией картинки.",
    role: ["Ты не придумываешь новую тему.", "Ты редактор, который переводит сухой экспертный план в понятный Reels-текст.", "Текст должен считываться за 1 секунду и попадать в широкую боль аудитории."],
    output: { headline: "короткий сильный заголовок, 4-9 слов, широкая боль или полезный факт", subhead: "одна простая строка, почему это знакомо в жизни", points: ["4-6 смысловых блоков, каждый 6-14 слов: мини-заголовок + короткое объяснение"], cta: "всегда пустая строка", disclaimer: "всегда пустая строка; нижние защитные подписи, футеры и сноски запрещены" },
    rules: [
      "Сохрани исходный смысл, сценарий и hook reference; не меняй тему на другую.",
      formatCurrentDatePrompt(),
      "Все поля headline, subhead, points, cta и disclaimer пиши только на русском; английские слова и латиницу переводи на русский, кроме официальных названий брендов и сервисов.",
      "CTA не нужен: верни cta пустой строкой и убери любые 'узнайте', 'сохраните', 'закажите', 'в описании', 'в профиле' из текста.",
      "Оставь 4-6 самых сильных смысловых фраз: достаточно плотных, чтобы читать дольше 5 секунд, но без длинной таблицы или рекламного каталога.",
      humanizedPointRule,
      "Headline максимум 6 слов, без двоеточия и второй мысли.",
      ...clickbaitHeadlineRules,
      ...simpleAudienceLanguageRules,
      ...viralReelsHookRules,
      ...hookPayoffRules,
      "Headline, subhead и points должны отвечать на одну тему.",
      "Анкета product — источник истины. Не добавляй свойства, обещания, формат, состав, объем, дозировку, бренд или упаковку, которых нет в product.",
      "Поля forbidden, restrictions и contentRestrictions — внутренние стоп-правила. Не превращай их в visible copy, points, CTA, disclaimer, футер, сноску или нижнюю строку.",
      "Не добавляй новые цифры, комиссии, гарантии, юридические факты, обход правил, диагнозы или финансовые обещания.",
      ...ruTextEditorialRules
    ],
    project: body.project,
    product: body.product,
    hookReference: body.hookReference,
    basePlan: body.plan,
    brief: body.brief,
    restrictions: { project: body.project?.restrictions || body.project?.contentRestrictions || "", productForbidden: body.product?.forbidden || [] }
  });
}

async function runRole({ token, model, callOpenRouter, parseJsonDraft, instruction, imageUrls = [] }) {
  const userContent = imageUrls.length
    ? [{ type: "text", text: instruction }, ...imageUrls.map((url) => ({ type: "image_url", image_url: { url } }))]
    : instruction;
  let lastError = null;
  for (let attempt = 1; attempt <= maxRoleJsonAttempts; attempt += 1) {
    const content = await callOpenRouter(token, model, [
      { role: "system", content: getRoleSystemPrompt(attempt) },
      { role: "user", content: userContent }
    ]);
    try {
      return parseJsonDraft(content);
    } catch (error) {
      if (!isJsonDraftFormatError(error)) throw error;
      if (attempt === maxRoleJsonAttempts) throw createRoleFormatError(error);
      lastError = error;
      console.warn(`[creative-team:json-retry] attempt=${attempt} reason=${error.message || error}`);
    }
  }
  throw createRoleFormatError(lastError);
}

function getRoleSystemPrompt(attempt) {
  if (attempt <= 1) return roleSystemPrompt;
  return `${roleSystemPrompt} Предыдущий ответ был отклонен: верни строго один JSON-объект, без markdown, комментариев, пояснений и текста вокруг.`;
}

function createRoleFormatError(error) {
  const wrapped = new Error("AI-команда несколько раз вернула черновик в неправильном формате. Запустите генерацию еще раз.");
  wrapped.cause = error;
  wrapped.code = error?.code || "json_draft_format";
  return wrapped;
}

function basePayload(task, role, output, extra = {}) {
  return { task, role, commonRules: commonRoleRules, output, ...extra };
}

function productPassportInstruction(body) {
  const input = createProductPassportInput(body);
  return JSON.stringify(basePayload(
    "Создай паспорт продукта. Это главный источник истины для всех следующих AI-ролей.",
    "Ты senior product strategist и редактор performance-контента.",
    {
      productPassport: {
        productName: "", category: "", plainDescription: "", audience: [], coreUseCases: [], painSituations: [], desires: [], objections: [], safeFacts: [], allowedClaims: [], forbiddenClaims: [],
        contentTerritory: { directProductTopics: [], adjacentHelpfulTopics: [], unsafeTopics: [] },
        productVisibilityRules: { showProductWhen: [], avoidProductWhen: [] },
        tone: "", openQuestions: []
      }
    },
    {
      rules: [
        "Внеси что это за продукт, кому он нужен, какие ситуации закрывает, боли, желания, возражения, safe facts и forbidden claims.",
        "Не добавляй visualIdentity и не диктуй визуальный стиль продукта: визуал берется из product reference только когда продукт активен в кадре.",
        "Не расширяй продукт типовыми обещаниями ниши.",
        "Используй только данные product. Дизайн-референсы, аватары, ссылки, изображения и контекст проекта здесь запрещены."
      ],
      product: input.product
    }
  ));
}

function designFormatBriefInstruction(body, productPassport) {
  return JSON.stringify(basePayload(
    "Проанализируй designReference как формат, структуру и визуальную грамматику для будущей инфографики.",
    "Ты design reference analyst и format architect для вертикальных соцсетей.",
    {
      designFormatBrief: {
        formatType: "ranking_leaderboard|comparison_grid|checklist_cards|timeline|symptom_poster|single_thesis|other",
        structureName: "",
        layoutSlots: [{ id: "", role: "headline|subtitle|source_bar|rank_card|value_label|image_slot|logo_slot|caption|note", textCapacity: "short|medium|number|none", repeatCount: 0, required: true }],
        textContract: { headlineShape: "", subheadShape: "", itemShape: "", minItems: 0, maxItems: 0, preferredItems: 0, mustIncludeNumbers: false, avoidTextTypes: [], forbiddenCarryoverText: [] },
        visualGrammar: { composition: "", background: "", palette: "", typography: "", framesAndDividers: "", imageTreatment: "", hierarchy: "" },
        safeZoneAdaptation: { edgePressure: "", topRisk: "", bottomRisk: "", rightRailRisk: "", leftRisk: "", remapPlan: [], decorativeOnlyZones: [] },
        adaptationRules: [],
        doNotCopy: []
      }
    },
    {
      rules: [
        "Если к сообщению приложена картинка designReference, считай ее главным источником структуры. Текстовые поля title/layoutType/promptComment вторичны и могут быть устаревшими.",
        "Смотри на референс не только как на стиль, а как на макет: заголовочная зона, служебные подписи, повторяемые карточки, шкалы, фото-слоты, иерархия и плотность.",
        "Если референс похож на рейтинг, топ, leaderboard или список мест, выбери formatType=ranking_leaderboard и задай сценаристу структуру ранжированных пунктов.",
        "Для ranking_leaderboard задай textContract: preferredItems 8-12, headlineShape начинается с ТОП, subheadShape как legend/source strip, itemShape 2-5 слов, forbiddenCarryoverText включает старые числа и checklist-формулы вроде '5 маркеров'.",
        "Опиши, какие смысловые слоты должен заполнить сценарист: например headline, subtitle, source_bar, rank_card, value_label, image_slot, caption.",
        "Укажи textCapacity честно: если в слот влезает только число или 2-4 слова, не разрешай длинные фразы.",
        "Оцени edge pressure референса: какие важные элементы прижаты к верхнему краю, нижним 30%, левому краю или правому rail Instagram.",
        "Заполни safeZoneAdaptation: topRisk/bottomRisk/rightRailRisk/leftRisk и remapPlan — как сохранить visual grammar, но перенести важный контент внутрь x=150..830, y=360..1300.",
        "В decorativeOnlyZones перечисли зоны референса, которые в будущих генерациях должны стать только фоном/текстурой без текста, карточек, продукта и важных объектов.",
        "Копируй структуру, ритм, сетку, иерархию, цветовую логику и типографический характер; не копируй людей, бренды, логотипы, чужой текст и чужие claims.",
        "Если референс содержит цифры или источники, не придумывай реальные цифры для продукта; разрешай условные ранги, признаки или критерии только если это безопасно.",
        "Для продукта вроде крема для лица адаптируй leaderboard как рейтинг признаков, ситуаций, ошибок, зон применения или критериев выбора, а не как список богатых людей."
      ],
      productPassport,
      designReference: body.activeDesignReference || body.reference,
      layoutContentPlan: body.layoutContentPlan,
      freePrompt: body.freePrompt
    }
  ));
}

function attentionMapInstruction(body, productPassport, designFormatBrief) {
  return JSON.stringify(basePayload(
    "На основе productPassport найди сильные углы внимания для соцсетей.",
    "Ты audience strategist для коротких соцсетей.",
    { attentionMap: { primaryAudienceTensions: [], hookSeedUsed: "", scrollStopperAngles: [{ angle: "", whyItHooks: "", viewerEmotion: "", safeProductBridge: "", riskLevel: "low|medium|high" }], contentQuestions: [], anglesToAvoid: [] } },
    {
      rules: ["Думай моментами узнавания: боль, ошибка, риск, желание, сомнение, бытовая ситуация, проверка перед покупкой.", "Используй hookSeed как формулу внимания, но не копируй текст дословно.", "Каждый angle пригоден для одного короткого ролика или инфографики.", "Работай внутри selectedTopicCluster: это главный тематический коридор текущей генерации.", "Не повторяй recentJobs и не используй частые старые углы.", "CTA, призывы купить, сохранить, перейти в профиль или читать описание здесь запрещены.", "Не используй зашитые сценарии; выводи углы из паспорта продукта."],
      productPassport,
      designFormatBrief,
      selectedTopicCluster: body.topicCluster || null,
      topicClusterPlan: body.topicClusterPlan || null,
      hookSeed: body.hookSeed || body.hookLibrary?.seedHook || null,
      recentJobs: (body.existingJobs || []).slice(0, 30)
    }
  ));
}

function creativeBriefInstruction(body, productPassport, attentionMap, designFormatBrief) {
  return JSON.stringify(basePayload(
    "Выбери один лучший angle и преврати его в креативную идею для одного вертикального поста 9:16.",
    "Ты creative director.",
    { creativeBrief: { topic: "", coreIdea: "", hookPromise: "", viewerTakeaway: "", productBridge: "", whyNow: "", avatarEmotionName: "", avoidRepeating: [], formatIntent: "checklist|comparison|myth_vs_reality|mistake_check|mini_diagnostic|saveable_note" } },
    {
      rules: ["Идея понятна за 1 секунду.", "Выбери один angle и один hook seed/formula, затем адаптируй пост сразу под дизайн-референс.", "Тема обязана раскрывать selectedTopicCluster, а не самый драматичный старый угол из истории.", "Есть конфликт или полезная проверка.", "Есть самостоятельная польза без покупки.", "Есть мягкий мост к продукту.", "Не повторяй recentJobs и не нарушай forbiddenClaims.", "Если productVisibilityDecision активен, учитывай product reference как реальный объект в кадре; если нет — не строь идею вокруг упаковки.", "Если avatarSafeZone активен, оставь место под будущий видео-аватар.", "avatarEmotionName выбирай только точным значением name из availableAvatarEmotions. Не придумывай эмоции. Если ни одна не подходит — верни пустую строку.", "Если designFormatBrief задает сильную структуру, выбирай идею, которая естественно ложится в эту структуру.", `Допустимые форматы: ${modernFormatOptions}.`],
      mandatorySlot: body.diversitySlot,
      selectedTopicCluster: body.topicCluster || null,
      topicClusterPlan: body.topicClusterPlan || null,
      availableAvatarEmotions: body.availableAvatarEmotions || [],
      productPassport,
      attentionMap,
      designFormatBrief,
      hookSeed: body.hookSeed || body.hookLibrary?.seedHook || null,
      productVisibilityDecision: body.productVisibilityDecision,
      avatarSafeZone: body.avatarSafeZone,
      recentJobs: (body.existingJobs || []).slice(0, 30)
    }
  ));
}

function hookProducerInstruction(body, productPassport, creativeBrief) {
  return JSON.stringify(basePayload(
    "Создай 5 вариантов хука для creativeBrief и выбери лучший.",
    "Ты hook producer для Reels/TikTok/Shorts.",
    { hookSet: [{ hook: "", mechanism: "curiosity|fear_of_mistake|useful_check|myth_break|personal_gain", payoffQuestion: "", whyItWorks: "", riskNote: "" }], recommendedHook: "", recommendedPayoffQuestion: "" },
    {
      rules: [
        "Если hookLibrary содержит хуки, используй один из них как случайную формулу внимания, а не как готовый текст.",
        "Адаптируй формулу под пользу продукта, бытовую ситуацию, проверку, ошибку, ритуал или косвенный совет вокруг продукта.",
        "Не делай хук и headline про бренд, название продукта, SKU или упаковку; бренд может остаться только внутренним контекстом.",
        "Хук короткий: лучше до 12 слов, максимум 14 слов.",
        "Хук конкретный и понятный без расшифровки.",
        "Для каждого hook заполни payoffQuestion: какой вопрос или обещание обязан закрыть будущий сценарий.",
        ...clickbaitHeadlineRules,
        ...simpleAudienceLanguageRules,
        ...viralReelsHookRules,
        "Не используй мутные формулы вроде 'главная ошибка' или 'одна привычка', если не называешь конкретику.",
        "Не выбирай recommendedHook, если он звучит как тема статьи, а не как первая фраза Reels.",
        "recommendedPayoffQuestion должен совпадать с payoffQuestion выбранного recommendedHook.",
        "Хук может быть острым, но не должен лгать, пугать без причины или обещать гарантированный результат."
      ],
      productPassport,
      creativeBrief,
      selectedTopicCluster: body.topicCluster || null,
      hookLibrary: body.hookLibrary
    }
  ));
}

function scriptwriterInstruction(body, productPassport, creativeBrief, hookSet, designFormatBrief) {
  return JSON.stringify(basePayload(
    "Напиши финальный смысловой сценарий для одного экрана.",
    "Ты social scriptwriter и редактор инфографик.",
    { contentScript: { headline: "", subhead: "", points: [], invisibleNotes: { hookPayoff: "", productBridge: "", claimSafety: "", whatNotToShow: [] } } },
    {
      rules: ["Headline обычно 4-9 слов; если recommendedHook сильный и помещается в дизайн, используй его как headline или укороти без потери смысла.", "Headline не обязан быть дословно 6 слов, если это ломает живой Reels-хук.", ...clickbaitHeadlineRules, ...simpleAudienceLanguageRules, ...viralReelsHookRules, ...hookPayoffRules, "Subhead одна короткая строка: объясняет конфликт headline, а не повторяет его.", "Первые 1-2 points закрывают recommendedPayoffQuestion выбранного hookSet.", "Каждый point: короткая бытовая причина + что это значит для зрителя. Не пиши только термин.", "Обычно 4-6 блоков; если designFormatBrief.formatType=ranking_leaderboard, сделай 8-12 коротких ранжированных пунктов под повторяемые rank cards.", "Подгони текст под textContract и layoutSlots из designFormatBrief.", "Если формат ranking_leaderboard, headline должен быть TOP/ТОП-формой, subhead должен быть legend/source strip, points должны быть короткими ranked items, а не обычным списком советов.", "Не переноси старые числа и формулы из темы, если они не совпадают с количеством rank cards: например '5 маркеров' нельзя оставлять для TOP 10/12.", "Не превышай textCapacity слотов: короткие подписи, числа и rank-card фразы должны быть компактными.", "Без CTA, футера, дисклеймера и сносок на изображении.", "Без claims, которых нет в productPassport.", "Все видимые слова на русском, кроме официальных названий брендов."],
      productPassport,
      creativeBrief,
      hookSet,
      designFormatBrief,
      selectedTopicCluster: body.topicCluster || null
    }
  ));
}

function artDirectorInstruction(body, productPassport, creativeBrief, contentScript, designFormatBrief) {
  return JSON.stringify(basePayload(
    "Создай visual brief для генерации изображения.",
    "Ты art director для вертикальных инфографик 9:16.",
    { visualBrief: { composition: "", styleDirection: "", mainVisualObject: "", productUsage: "exact_product|small_signal|do_not_show", textHierarchy: "", safeZoneNotes: "", negativeVisuals: [], referenceUsage: { useFromReference: [], doNotCopyFromReference: [] } } },
    {
      rules: ["Дизайн-референс использовать как структуру и стиль, не как копию.", "Сохрани layout grammar из designFormatBrief: композицию, повторяемые блоки, визуальный ритм, иерархию, рамки, шкалы и плотность.", "Если formatType=ranking_leaderboard, опиши вертикальный рейтинг/таблицу с повторяемыми карточками и короткими value labels, адаптированными под продукт.", "Не копировать чужой текст, продукт, логотипы и обещания.", "Продукт показывать только если это уместно по productVisibilityRules.", "Важный текст держать в safe zone.", "Нижнюю часть не перегружать: там может быть видео-оверлей."],
      productPassport,
      creativeBrief,
      contentScript,
      designFormatBrief,
      selectedTopicCluster: body.topicCluster || null,
      designReference: body.activeDesignReference || body.reference,
      layoutContentPlan: body.layoutContentPlan
    }
  ));
}

function safetyEditorInstruction(body, productPassport, creativeBrief, contentScript, visualBrief) {
  return JSON.stringify(basePayload(
    "Проверь паспорт, сценарий и visual brief перед финальным промптом.",
    "Ты safety editor для рекламного и образовательного контента.",
    { safetyReview: { generationAllowed: true, issues: [], fixedContentScript: { headline: "", subhead: "", points: [] }, fixedVisualBrief: {}, finalWarnings: [] } },
    {
      rules: ["Найди выдуманные факты, запрещенные promises, медицинские, финансовые и юридические гарантии, токсичные формулировки, CTA/футеры/дисклеймеры и несоответствие продукта визуалу.", ...hookPayoffRules, "Если headline обещает одно, а points раскрывают другое, исправь fixedContentScript без смены темы.", "Если риск можно исправить, верни исправленную версию.", "Если риск критичный, generationAllowed=false."],
      productPassport,
      creativeBrief,
      contentScript,
      visualBrief,
      projectRestrictions: body.project?.restrictions || body.project?.contentRestrictions || ""
    }
  ));
}

function imagePromptEngineerInstruction(body, productPassport, creativeBrief, contentScript, visualBrief, safetyReview, designFormatBrief) {
  return JSON.stringify(basePayload(
    "Собери короткий финальный prompt для GPT Image 2.",
    "Ты prompt engineer для GPT Image 2.",
    { imagePromptPackage: { provider: "gpt-image-2", prompt: "", inputRefs: [{ role: "safe_zone|design|product", title: "", required: true }], promptBudgetNotes: { mustKeep: [], canDropIfTooLong: [] } } },
    {
      rules: ["Верни imagePromptPackage.prompt как структурированный Markdown с JSON-блоком prompt contract внутри.", "Промпт пишет нейросеть на основе данных ниже; не собирай его шаблонно.", "Включи vertical 9:16 infographic.", formatCurrentDatePrompt(), "Весь редакционный текст инфографики строго на русском.", "Если designReference содержит английский visible text, не копируй его как текст или пиксели: сохрани только визуальную грамматику, а все заголовки, карточки, подписи, легенды и служебные ярлыки замени русским текстом из contentScript.", "SAFE ZONE REFERENCE: среди input images всегда есть role=safe_zone; это служебная 9:16 маска размещения, не дизайн, не фон, не палитра и не источник композиционного стиля.", "DESIGN REFERENCE остается главным источником визуального стиля: layout skeleton, ритм, типографика, палитра, плотность, формы карточек и композиционная идея.", "RECREATE DESIGN REFERENCE INSIDE SAFE-ZONE: сначала воссоздай visual grammar дизайн-референса, затем remap/scale/shift важный контент внутрь белой области safe_zone.", ...socialSafeZonePixelRules, ...designReferenceFidelityRules, "Белая область safe_zone — единственное место для текста, карточек, номеров, продукта, символов, иконок и важных объектов; фиолетовую область не заполняй ничем смысловым.", "Не копируй цвета, прямоугольники или форму safe_zone маски в финальный дизайн; используй safe_zone только как placement mask only.", "Не заменяй дизайн-референс generic centered checklist, если выбранный референс не является чеклистом.", "Текст, логотипы, SKU, вкус, объем и название продукта, уже напечатанные на реальной упаковке из product reference, не переводить и не менять.", "Headline, subhead и points — финальный русский текстовый контракт.", "Стиль и layout grammar из designFormatBrief/designReference.", "Если formatType=ranking_leaderboard, финальный prompt обязан описывать leaderboard/top-chart skeleton: крупный верхний title, легенда/source bar, повторяемые ранговые колонки или rank cards, номера мест и короткие value labels; запрети превращение в белый checklist с иконками.", "Если productVisibilityDecision.shouldPassProductRefs=true, явно укажи использовать product reference как input image. Если false — явно запрети packshot/product reference.", "Если avatarSafeZone есть, оставь чистую зону под аватара.", "Отступы обязательны: весь смысловой текст и главный объект внутри центральной рабочей области, с заметным padding слева/справа, чистым правым rail под кнопки соцсетей и спокойной нижней четвертью под будущий видео-оверлей.", "Запрет CTA в сгенерированной картинке, но не блокируй будущий системный CTA overlay приложения.", "Запрет футера, дисклеймера и неуказанных claims; не добавляй новые логотипы, но не удаляй логотипы, уже напечатанные на реальной упаковке product reference.", "Не вставляй весь паспорт продукта. Возьми только факты, нужные для этой картинки.", modernImageFormatRule, oldFormatShellBan],
      productPassport,
      creativeBrief,
      contentScript: safetyReview?.safetyReview?.fixedContentScript?.headline ? safetyReview.safetyReview.fixedContentScript : contentScript,
      visualBrief: Object.keys(safetyReview?.safetyReview?.fixedVisualBrief || {}).length ? safetyReview.safetyReview.fixedVisualBrief : visualBrief,
      designFormatBrief,
      selectedTopicCluster: body.topicCluster || null,
      designReference: body.activeDesignReference || body.reference,
      productVisibilityDecision: body.productVisibilityDecision,
      avatarSafeZone: body.avatarSafeZone
    }
  ));
}

function flattenCreativeTeamDraft(parts) {
  const passport = parts.productPassport.productPassport || parts.productPassport;
  const designFormatBrief = resolveDesignFormatBrief(parts.designFormatBrief.designFormatBrief || parts.designFormatBrief, parts.body);
  const attentionMap = parts.attentionMap.attentionMap || parts.attentionMap;
  const creativeBrief = parts.creativeBrief.creativeBrief || parts.creativeBrief;
  const hookPayload = normalizeHookPayload(parts.hookSet);
  const contentScript = parts.contentScript.contentScript || parts.contentScript;
  const visualBrief = parts.visualBrief.visualBrief || parts.visualBrief;
  const safetyReview = parts.safetyReview.safetyReview || parts.safetyReview;
  const imagePromptPackage = parts.imagePromptPackage.imagePromptPackage || parts.imagePromptPackage;
  const fixedScript = safetyReview?.fixedContentScript?.headline ? safetyReview.fixedContentScript : contentScript;
  const finalViolations = getDesignTextContractViolations({ contentScript: fixedScript, designFormatBrief });
  const finalScript = fixedScript;
  const outputSafetyReview = finalViolations.length
    ? { ...safetyReview, finalWarnings: [...(safetyReview.finalWarnings || []), `Design text contract still has violations: ${finalViolations.join(", ")}.`] }
    : safetyReview;
  return {
    productPassport: passport,
    designFormatBrief,
    attentionMap,
    creativeBrief,
    hookSet: hookPayload.hookSet,
    recommendedHook: hookPayload.recommendedHook,
    recommendedPayoffQuestion: hookPayload.recommendedPayoffQuestion,
    contentScript: finalScript,
    visualBrief: Object.keys(outputSafetyReview?.fixedVisualBrief || {}).length ? outputSafetyReview.fixedVisualBrief : visualBrief,
    formatCompliance: parts.formatCompliance.formatCompliance || parts.formatCompliance,
    textContractViolations: [...new Set([...(parts.textContractViolations || []), ...finalViolations])],
    safetyReview: outputSafetyReview,
    imagePromptPackage,
    productVisibilityDecision: parts.body.productVisibilityDecision || null,
    avatarEmotionName: creativeBrief.avatarEmotionName || "",
    availableAvatarEmotions: parts.body.availableAvatarEmotions || [],
    topicCluster: parts.body.topicCluster || null,
    topicClusterPlan: parts.body.topicClusterPlan || null,
    hookSeed: parts.body.hookSeed || parts.body.hookLibrary?.seedHook?.text || hookPayload.recommendedHook,
    qaReview: outputSafetyReview,
    imagePromptContract: imagePromptPackage.promptContract || imagePromptPackage.contract || null,
    semanticKey: parts.body.diversitySlot?.id || creativeBrief.topic || "",
    topic: parts.body.diversitySlot?.lockTopic ? parts.body.diversitySlot.topic : creativeBrief.topic,
    hook: hookPayload.recommendedHook,
    format: designFormatBrief.formatType || creativeBrief.formatIntent,
    pointCount: String((finalScript.points || []).length || 5),
    visualObject: visualBrief.mainVisualObject || "",
    cta: "",
    sourceHook: hookPayload.recommendedHook,
    productFact: passport.safeFacts?.[0] || "",
    productPositiveBridge: creativeBrief.productBridge || finalScript.invisibleNotes?.productBridge || "",
    plan: { headline: finalScript.headline, subhead: finalScript.subhead, points: finalScript.points || [], disclaimer: "" },
    qualityChecks: { generationAllowed: outputSafetyReview.generationAllowed !== false, issues: outputSafetyReview.issues || [], finalWarnings: outputSafetyReview.finalWarnings || [] }
  };
}

function resolveDesignFormatBrief(designFormatBrief = {}, body = {}) {
  const formatSignals = [designFormatBrief.formatType, body.reference?.layoutType, body.activeDesignReference?.layoutType, body.diversitySlot?.format];
  if (formatSignals.includes("ranking_leaderboard")) return { ...designFormatBrief, formatType: "ranking_leaderboard" };
  return designFormatBrief;
}

function getCompliantContentScript(contentScript, formatCompliance) {
  const baseScript = contentScript.contentScript || contentScript || {};
  const compliance = formatCompliance.formatCompliance || formatCompliance || {};
  const fixed = compliance.fixedContentScript || {};
  if (!fixed.headline && !fixed.subhead && !Array.isArray(fixed.points)) return baseScript;
  return {
    ...baseScript,
    headline: fixed.headline || baseScript.headline || "",
    subhead: fixed.subhead || baseScript.subhead || "",
    points: Array.isArray(fixed.points) && fixed.points.length ? fixed.points : baseScript.points || []
  };
}

function getSafetyFixedContentScript(contentScript, safetyReview) {
  const review = safetyReview.safetyReview || safetyReview || {};
  const fixed = review.fixedContentScript || {};
  if (!fixed.headline && !fixed.subhead && !Array.isArray(fixed.points)) return contentScript;
  return {
    ...contentScript,
    headline: fixed.headline || contentScript.headline || "",
    subhead: fixed.subhead || contentScript.subhead || "",
    points: Array.isArray(fixed.points) && fixed.points.length ? fixed.points : contentScript.points || []
  };
}

function withFinalContentScript(safetyReview, finalScript, safetyContractViolations) {
  void finalScript;
  if (!safetyContractViolations.length) return safetyReview;
  const review = safetyReview.safetyReview || safetyReview || {};
  return {
    safetyReview: {
      ...review,
      finalWarnings: [...(review.finalWarnings || []), `Design text contract still has violations: ${safetyContractViolations.join(", ")}.`]
    }
  };
}

function normalizeHookPayload(payload) {
  const source = payload.hookSet ? payload : payload.hookSet || {};
  return {
    hookSet: Array.isArray(source.hookSet) ? source.hookSet : [],
    recommendedHook: source.recommendedHook || source.hookSet?.[0]?.hook || "",
    recommendedPayoffQuestion: source.recommendedPayoffQuestion || source.hookSet?.[0]?.payoffQuestion || ""
  };
}
