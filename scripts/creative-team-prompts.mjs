import { humanizedPointRule, modernFormatOptions, modernImageFormatRule, oldFormatShellBan } from "../src/domain/generation-format-contract.js";

const commonRoleRules = [
  "Ты часть креативной команды для коротких вертикальных соцсетей: Reels, TikTok, Shorts.",
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
  "CTA не нужен на изображении.",
  "Делай shareable value: мини-диагностика, ошибка ожиданий, сравнение подходов, простая привычка или проверяемая деталь.",
  "Финальная самопроверка маркетолога: короткий конкретный заголовок, связанные блоки, полезный смысл без покупки, нет запрещенных обещаний.",
  "Тон может быть триггерный, актуальный, спорный, но не порочащий репутацию автора. Правда, реальные факты, без лжи.",
  "Спорность строить через честный конфликт: популярное обещание против реальной привычки, ожидание против ограничений, тренд против здравого смысла, громкий совет против проверяемой детали.",
  "Не делай утверждения, которые нельзя защитить фактами."
];

const roleSystemPrompt = "Ты senior-участник AI-креативной команды. Пиши по-русски. Верни только JSON без markdown.";

export async function runCreativeTeamBrief({ token, body, model, callOpenRouter, parseJsonDraft }) {
  const productPassport = await runRole({ token, model, callOpenRouter, parseJsonDraft, instruction: productPassportInstruction(body) });
  const designFormatBrief = await runRole({ token, model, callOpenRouter, parseJsonDraft, instruction: designFormatBriefInstruction(body, productPassport) });
  const attentionMap = await runRole({ token, model, callOpenRouter, parseJsonDraft, instruction: attentionMapInstruction(body, productPassport, designFormatBrief) });
  const creativeBrief = await runRole({ token, model, callOpenRouter, parseJsonDraft, instruction: creativeBriefInstruction(body, productPassport, attentionMap, designFormatBrief) });
  const hookSet = await runRole({ token, model, callOpenRouter, parseJsonDraft, instruction: hookProducerInstruction(body, productPassport, creativeBrief) });
  const contentScript = await runRole({ token, model, callOpenRouter, parseJsonDraft, instruction: scriptwriterInstruction(body, productPassport, creativeBrief, hookSet, designFormatBrief) });
  const visualBrief = await runRole({ token, model, callOpenRouter, parseJsonDraft, instruction: artDirectorInstruction(body, productPassport, creativeBrief, contentScript, designFormatBrief) });
  const safetyReview = await runRole({ token, model, callOpenRouter, parseJsonDraft, instruction: safetyEditorInstruction(body, productPassport, creativeBrief, contentScript, visualBrief) });
  const imagePromptPackage = await runRole({ token, model, callOpenRouter, parseJsonDraft, instruction: imagePromptEngineerInstruction(body, productPassport, creativeBrief, contentScript, visualBrief, safetyReview, designFormatBrief) });
  return flattenCreativeTeamDraft({ productPassport, designFormatBrief, attentionMap, creativeBrief, hookSet, contentScript, visualBrief, safetyReview, imagePromptPackage, body });
}

export function humanizeTextInstruction(body) {
  return JSON.stringify({
    task: "Перепиши финальный текст инфографики человеческим массовым языком перед генерацией картинки.",
    role: ["Ты не придумываешь новую тему.", "Ты редактор, который переводит сухой экспертный план в понятный Reels-текст.", "Текст должен считываться за 1 секунду и попадать в широкую боль аудитории."],
    output: { headline: "короткий сильный заголовок, 4-9 слов, широкая боль или полезный факт", subhead: "одна простая строка, почему это знакомо в жизни", points: ["4-6 смысловых блоков, каждый 6-14 слов: мини-заголовок + короткое объяснение"], cta: "всегда пустая строка", disclaimer: "всегда пустая строка; нижние защитные подписи, футеры и сноски запрещены" },
    rules: [
      "Сохрани исходный смысл, сценарий и hook reference; не меняй тему на другую.",
      "Все поля headline, subhead, points, cta и disclaimer пиши только на русском; английские слова и латиницу переводи на русский, кроме официальных названий брендов и сервисов.",
      "CTA не нужен: верни cta пустой строкой и убери любые 'узнайте', 'сохраните', 'закажите', 'в описании', 'в профиле' из текста.",
      "Оставь 4-6 самых сильных смысловых фраз: достаточно плотных, чтобы читать дольше 5 секунд, но без длинной таблицы или рекламного каталога.",
      humanizedPointRule,
      "Headline максимум 6 слов, без двоеточия и второй мысли.",
      "Headline, subhead и points должны отвечать на одну тему.",
      "Анкета product — источник истины. Не добавляй свойства, обещания, формат, состав, объем, дозировку, бренд или упаковку, которых нет в product.",
      "Поля forbidden, restrictions и contentRestrictions — внутренние стоп-правила. Не превращай их в visible copy, points, CTA, disclaimer, футер, сноску или нижнюю строку.",
      "Не добавляй новые цифры, комиссии, гарантии, юридические факты, обход правил, диагнозы или финансовые обещания."
    ],
    project: body.project,
    product: body.product,
    hookReference: body.hookReference,
    basePlan: body.plan,
    brief: body.brief,
    restrictions: { project: body.project?.restrictions || body.project?.contentRestrictions || "", productForbidden: body.product?.forbidden || [] }
  });
}

async function runRole({ token, model, callOpenRouter, parseJsonDraft, instruction }) {
  const content = await callOpenRouter(token, model, [
    { role: "system", content: roleSystemPrompt },
    { role: "user", content: instruction }
  ]);
  return parseJsonDraft(content);
}

function basePayload(task, role, output, extra = {}) {
  return { task, role, commonRules: commonRoleRules, output, ...extra };
}

function productPassportInstruction(body) {
  return JSON.stringify(basePayload(
    "Создай паспорт продукта. Это главный источник истины для всех следующих AI-ролей.",
    "Ты senior product strategist и редактор performance-контента.",
    {
      productPassport: {
        productName: "", category: "", plainDescription: "", audience: [], coreUseCases: [], painSituations: [], desires: [], objections: [], safeFacts: [], allowedClaims: [], forbiddenClaims: [],
        visualIdentity: { productLook: "", mustPreserve: [], doNotInvent: [] },
        contentTerritory: { directProductTopics: [], adjacentHelpfulTopics: [], unsafeTopics: [] },
        productVisibilityRules: { showProductWhen: [], avoidProductWhen: [] },
        tone: "", openQuestions: []
      }
    },
    {
      rules: [
        "Внеси что это за продукт, кому он нужен, какие ситуации закрывает, боли, желания, возражения, safe facts, forbidden claims и визуальные правила.",
        "Не расширяй продукт типовыми обещаниями ниши.",
        "Фото и product references используй только как источник внешнего вида."
      ],
      project: body.project,
      product: body.product,
      reference: body.reference
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
        textContract: { headlineShape: "", itemShape: "", maxItems: 0, mustIncludeNumbers: false, avoidTextTypes: [] },
        visualGrammar: { composition: "", background: "", palette: "", typography: "", framesAndDividers: "", imageTreatment: "", hierarchy: "" },
        adaptationRules: [],
        doNotCopy: []
      }
    },
    {
      rules: [
        "Смотри на референс не только как на стиль, а как на макет: заголовочная зона, служебные подписи, повторяемые карточки, шкалы, фото-слоты, иерархия и плотность.",
        "Если референс похож на рейтинг, топ, leaderboard или список мест, выбери formatType=ranking_leaderboard и задай сценаристу структуру ранжированных пунктов.",
        "Опиши, какие смысловые слоты должен заполнить сценарист: например headline, subtitle, source_bar, rank_card, value_label, image_slot, caption.",
        "Укажи textCapacity честно: если в слот влезает только число или 2-4 слова, не разрешай длинные фразы.",
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
    { attentionMap: { primaryAudienceTensions: [], scrollStopperAngles: [{ angle: "", whyItHooks: "", viewerEmotion: "", safeProductBridge: "", riskLevel: "low|medium|high" }], contentQuestions: [], anglesToAvoid: [] } },
    {
      rules: ["Думай моментами узнавания: боль, ошибка, риск, желание, сомнение, бытовая ситуация, проверка перед покупкой.", "Каждый angle пригоден для одного короткого ролика или инфографики.", "Не используй зашитые сценарии; выводи углы из паспорта продукта."],
      productPassport,
      designFormatBrief,
      recentJobs: (body.existingJobs || []).slice(0, 30)
    }
  ));
}

function creativeBriefInstruction(body, productPassport, attentionMap, designFormatBrief) {
  return JSON.stringify(basePayload(
    "Выбери один лучший angle и преврати его в креативную идею для одного вертикального поста 9:16.",
    "Ты creative director.",
    { creativeBrief: { topic: "", coreIdea: "", hookPromise: "", viewerTakeaway: "", productBridge: "", whyNow: "", avoidRepeating: [], formatIntent: "checklist|comparison|myth_vs_reality|mistake_check|mini_diagnostic|saveable_note" } },
    {
      rules: ["Идея понятна за 1 секунду.", "Есть конфликт или полезная проверка.", "Есть самостоятельная польза без покупки.", "Есть мягкий мост к продукту.", "Не повторяй recentJobs и не нарушай forbiddenClaims.", "Если designFormatBrief задает сильную структуру, выбирай идею, которая естественно ложится в эту структуру.", `Допустимые форматы: ${modernFormatOptions}.`],
      mandatorySlot: body.diversitySlot,
      productPassport,
      attentionMap,
      designFormatBrief,
      recentJobs: (body.existingJobs || []).slice(0, 30)
    }
  ));
}

function hookProducerInstruction(body, productPassport, creativeBrief) {
  return JSON.stringify(basePayload(
    "Создай 5 вариантов хука для creativeBrief и выбери лучший.",
    "Ты hook producer для Reels/TikTok/Shorts.",
    { hookSet: [{ hook: "", mechanism: "curiosity|fear_of_mistake|useful_check|myth_break|personal_gain", whyItWorks: "", riskNote: "" }], recommendedHook: "" },
    {
      rules: ["Хук короткий, конкретный и понятный без расшифровки.", "Не используй мутные формулы вроде 'главная ошибка' или 'одна привычка', если не называешь конкретику.", "Хук может быть острым, но не должен лгать, пугать без причины или обещать гарантированный результат."],
      productPassport,
      creativeBrief,
      hookLibrary: body.hookLibrary
    }
  ));
}

function scriptwriterInstruction(body, productPassport, creativeBrief, hookSet, designFormatBrief) {
  return JSON.stringify(basePayload(
    "Напиши финальный смысловой сценарий для одного экрана.",
    "Ты social scriptwriter и редактор инфографик.",
    { contentScript: { headline: "", subhead: "", points: [], invisibleNotes: { productBridge: "", claimSafety: "", whatNotToShow: [] } } },
    {
      rules: ["Headline максимум 6 слов.", "Subhead одна короткая строка.", "4-6 блоков, каждый добавляет новый смысл.", "Подгони текст под слоты designFormatBrief: если формат ranking_leaderboard, points должны быть короткими ранжированными пунктами, а не обычным списком советов.", "Не превышай textCapacity слотов: короткие подписи, числа и rank-card фразы должны быть компактными.", "Без CTA, футера, дисклеймера и сносок на изображении.", "Без claims, которых нет в productPassport.", "Все видимые слова на русском, кроме официальных названий брендов."],
      productPassport,
      creativeBrief,
      hookSet,
      designFormatBrief
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
      rules: ["Найди выдуманные факты, запрещенные promises, медицинские, финансовые и юридические гарантии, токсичные формулировки, CTA/футеры/дисклеймеры и несоответствие продукта визуалу.", "Если риск можно исправить, верни исправленную версию.", "Если риск критичный, generationAllowed=false."],
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
    { imagePromptPackage: { provider: "gpt-image-2", prompt: "", inputRefs: [{ role: "design|product", title: "", required: true }], promptBudgetNotes: { mustKeep: [], canDropIfTooLong: [] } } },
    {
      rules: ["Включи vertical 9:16 infographic.", "Весь видимый текст строго на русском.", "Headline, subhead и points — финальный текстовый контракт.", "Стиль и layout grammar из designFormatBrief/designReference.", "Если formatType=ranking_leaderboard, финальный prompt обязан описывать leaderboard/top-chart skeleton: крупный верхний title, легенда/source bar, повторяемые ранговые колонки или rank cards, номера мест и короткие value labels; запрети превращение в белый checklist с иконками.", "Правила использования продукта.", "Safe zone.", "Запрет CTA, футера, дисклеймера, логотипов и неуказанных claims.", "Не вставляй весь паспорт продукта. Возьми только факты, нужные для этой картинки.", modernImageFormatRule, oldFormatShellBan],
      productPassport,
      creativeBrief,
      contentScript: safetyReview?.safetyReview?.fixedContentScript?.headline ? safetyReview.safetyReview.fixedContentScript : contentScript,
      visualBrief: Object.keys(safetyReview?.safetyReview?.fixedVisualBrief || {}).length ? safetyReview.safetyReview.fixedVisualBrief : visualBrief,
      designFormatBrief,
      designReference: body.activeDesignReference || body.reference
    }
  ));
}

function flattenCreativeTeamDraft(parts) {
  const passport = parts.productPassport.productPassport || parts.productPassport;
  const designFormatBrief = parts.designFormatBrief.designFormatBrief || parts.designFormatBrief;
  const attentionMap = parts.attentionMap.attentionMap || parts.attentionMap;
  const creativeBrief = parts.creativeBrief.creativeBrief || parts.creativeBrief;
  const hookPayload = normalizeHookPayload(parts.hookSet);
  const contentScript = parts.contentScript.contentScript || parts.contentScript;
  const visualBrief = parts.visualBrief.visualBrief || parts.visualBrief;
  const safetyReview = parts.safetyReview.safetyReview || parts.safetyReview;
  const imagePromptPackage = parts.imagePromptPackage.imagePromptPackage || parts.imagePromptPackage;
  const fixedScript = safetyReview?.fixedContentScript?.headline ? safetyReview.fixedContentScript : contentScript;
  return {
    productPassport: passport,
    designFormatBrief,
    attentionMap,
    creativeBrief,
    hookSet: hookPayload.hookSet,
    recommendedHook: hookPayload.recommendedHook,
    contentScript: fixedScript,
    visualBrief: Object.keys(safetyReview?.fixedVisualBrief || {}).length ? safetyReview.fixedVisualBrief : visualBrief,
    safetyReview,
    imagePromptPackage,
    semanticKey: parts.body.diversitySlot?.id || creativeBrief.topic || "",
    topic: parts.body.diversitySlot?.lockTopic ? parts.body.diversitySlot.topic : creativeBrief.topic,
    hook: hookPayload.recommendedHook,
    format: designFormatBrief.formatType || creativeBrief.formatIntent,
    pointCount: String((fixedScript.points || []).length || 5),
    visualObject: visualBrief.mainVisualObject || "",
    cta: "",
    sourceHook: hookPayload.recommendedHook,
    productFact: passport.safeFacts?.[0] || "",
    productPositiveBridge: creativeBrief.productBridge || fixedScript.invisibleNotes?.productBridge || "",
    plan: { headline: fixedScript.headline, subhead: fixedScript.subhead, points: fixedScript.points || [], disclaimer: "" },
    qualityChecks: { generationAllowed: safetyReview.generationAllowed !== false, issues: safetyReview.issues || [], finalWarnings: safetyReview.finalWarnings || [] }
  };
}

function normalizeHookPayload(payload) {
  const source = payload.hookSet ? payload : payload.hookSet || {};
  return {
    hookSet: Array.isArray(source.hookSet) ? source.hookSet : [],
    recommendedHook: source.recommendedHook || source.hookSet?.[0]?.hook || ""
  };
}
