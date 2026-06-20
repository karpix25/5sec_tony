import { generationStages } from "./entities.js";
import { noAvatarCharacterId } from "./avatar-selection.js";
import { createContentSlot } from "./content-rotation.js";
import { getCompositionInstruction, pickCompositionMode } from "./composition-modes.js";
import { getContentLayerInstruction } from "./content-layers.js";
import { createMeaningBrief, createUniversalSemanticPlan, scoreMeaningBrief } from "./meaning-engine.js";
import { createPaymentPlan, getScenarioVisualInstruction } from "./payment-plan.js";
import { buildDesignReferenceConsistencyInstructions } from "./design-style-lock.js";
import { buildProductProfile } from "./product-profile.js";
import { createTopicCandidatePlan, pickTopicCandidate } from "./topic-candidates.js";

const hookStarters = [
  "Почему это срывает результат",
  "Три признака, что пора менять подход",
  "Неочевидная ошибка в продукте",
  "Что проверить перед покупкой",
  "Как понять, что вам это подходит"
];

const russianImageTextRules = [
  "ЯЗЫК НА ИЗОБРАЖЕНИИ: весь видимый текст строго на русском языке.",
  "Не использовать английские слова, английские заголовки, латиницу, lorem ipsum, pseudo-English и UI labels вроде Subscribe, Payment, Error, Loading, Failed.",
  "Если в исходных данных, референсе, продукте или PDF-хуке есть английский текст или латиница, переведи смысл на русский перед размещением на изображении.",
  "Исключение: официальные названия брендов и сервисов можно оставить латиницей, но не делать из них заголовки, пункты или CTA."
];

const socialSafeZoneRules = [
  "ТЕХНИЧЕСКАЯ SAFE ZONE: это не видимый текст, не рамка и не декоративное поле, а рабочая зона вертикального Reels/TikTok/Shorts, которую не перекрывают элементы соцсетей.",
  "КРИТИЧНО: слова safe zone, social safe zone, координаты, x=, y=, top UI, bottom caption и right action rail никогда не писать и не рисовать на финальной картинке.",
  "Координатный контракт для 1024x1792: весь важный контент размещать только внутри прямоугольника x=72..820 и y=190..1360.",
  "ЗАПРЕЩЕННЫЕ ЗОНЫ: top UI y=0..190, bottom caption/actions y=1360..1792, right action rail x=820..1024. Там не должно быть текста, CTA, продукта, логотипа, цены, важных иконок и смысловых карточек.",
  "Нижние 24% кадра оставить чистыми или фоновыми: без кнопки, без CTA, без дисклеймера, без продукта, без мелкого текста.",
  "Правый край оставить фоновым: там обычно стоят лайк, комментарий, репост и меню, поэтому не ставить туда списки, продукт, стрелки, номера и ключевые визуальные объекты.",
  "Если дизайн-референс ставит важный текст, CTA или продукт у края/внизу, адаптировать композицию под safe zone, сохранив стиль."
];

const designReferenceRules = [
  "ДИЗАЙН-РЕФЕРЕНС — ИСТОЧНИК СТИЛЯ, А НЕ БУКВАЛЬНОЙ ВЕРСТКИ: брать палитру, типографику, контраст, форму карточек, фактуры, свет, обводки, ритм и декоративные элементы.",
  "Не копировать референс как один и тот же макет. Композиция может меняться под задачу: список, таблица, сравнение, сетка, схема, карточки или таймлайн.",
  "Если в задаче задан composition mode, он важнее буквальной верстки референса. Референс должен окрасить макет визуально, а не запретить новый формат.",
  "Если референс не использует нумерованный список, это не значит, что все будущие макеты должны повторять его буквально. Сохраняй язык дизайна, а не один скриншот."
];

const productVisibilityRules = [
  "ПРОДУКТ ПОКАЗЫВАТЬ ТОЛЬКО В ТЕМУ: не вставлять упаковку в каждую генерацию ради рекламы. Если тема бытовая или образовательная, продукт может быть только мягким сигналом или вообще остаться за кадром.",
  "ПРОДУКТ В КАДРЕ НЕ РАВЕН УПАКОВКЕ: если продукт не обязателен по смыслу, лучше показать ситуацию, ингредиент, ритуал, интерфейс или предмет боли без любой упаковки.",
  "Не пихать упаковку в каждую генерацию. Крупная упаковка нужна только когда тема прямо про продукт, выбор, применение, состав или упаковку; в остальных случаях упаковку не показывать вообще.",
  "Если у продукта есть product reference images, использовать их как источник внешнего вида продукта; дизайн-референс не должен заменять продукт чужим объектом.",
  "ТОЧНОСТЬ ПРОДУКТА: не менять форму упаковки, цвет, этикетку, название, формат, объем, крышку, коробку и SKU. Лучше показать меньше деталей, но сохранить реальный внешний вид из product reference images.",
  "Если точный внешний вид продукта не виден или недоступен как image-to-image, не придумывать бренд, дозировку, капсулы, таблетки, объем, состав, новую этикетку, новую коробку или нейтральную упаковку.",
  "Если точный product reference не передан в генератор как image-to-image, НЕ рисовать крупную фронтальную упаковку с новой этикеткой и не подменять продукт похожей generic-банкой.",
  "Не придумывать новые варианты упаковки, ребрендинг, аптечный блистер, таблетки, медицинский флакон, лекарственную коробку или чужой продукт вместо исходного.",
  "Если продукт нематериальный, показать понятную визуализацию услуги: экран сервиса, карту, заявку, чек, подписку, процесс или другой предмет, напрямую связанный с оффером.",
  "СВЯЗЬ ПРОДУКТА С ТЕМОЙ: рядом с продуктом должен быть понятный мост: какую боль, привычку или ситуацию он помогает закрыть. Не ставить продукт как случайную упаковку рядом с чужой темой."
];

const contentQualityRules = [
  "ПОНЯТНЫЙ ЗАГОЛОВОК: хук должен быть самодостаточным и сразу объяснять конфликт. Не писать загадочные заголовки вроде 'одна привычка', 'это', 'главная ошибка', если внутри заголовка не понятно, какая именно ситуация или причина.",
  "КОРОТКИЙ ЗАГОЛОВОК: максимум 6 слов, одна мысль, без двоеточий и без второй строки-объяснения внутри заголовка.",
  "Запрещены длинные заголовочные оболочки: 'Этот факт объясняет знакомое ощущение', 'Популярное объяснение часто сбивает с толку', 'Один простой шаг часто меняет больше, чем кажется'.",
  "ЛОГИКА ТЕКСТА: headline, subhead и пункты должны раскрывать одну и ту же тему. Не смешивать ВПН, рекламный кабинет, заявки, поддержку и нейросети в одном макете.",
  "Писать заголовки естественным русским порядком слов: 'Оплата ВПН без сюрпризов', а не 'ВПН оплатить'.",
  "РЕДАКЦИОННЫЙ СТАНДАРТ: текст может быть триггерным, актуальным, спорным и дискуссионным, но не должен порочить репутацию автора. Только правдивая информация, реальные факты, без лжи.",
  "Спорность строить через честный конфликт: миф против факта, тренд против здравого смысла, ожидание против ограничений, популярный совет против реальной привычки.",
  "Не рисовать обвинения, токсичные формулировки, страшилки, непроверяемые claims, финансовую/медицинскую панику или категоричные обещания.",
  "СОХРАНЯЕМЫЙ СКРИН: формат должен быть похож на полезный соцсетевой скрин, который хочется рассматривать: топ, схема, миф/факт, что будет если, почему не говорят, типичные признаки.",
  "ПЛОТНОСТЬ БЕЗ КАШИ: 4-6 коротких смысловых блоков; каждый блок содержит мини-заголовок и короткое объяснение. Номера использовать только если выбранный дизайн-референс явно построен на нумерации.",
  "Текст должен удерживать взгляд дольше 5 секунд, но оставаться читаемым с телефона: без длинных абзацев, без микрошрифта и без случайной сетки.",
  "Метафоры использовать только если они мгновенно объясняют проблему. Не уводить тему в случайные объекты вроде кофемашины, телефона или батарейки, если связь с продуктом и болью не очевидна за одну строку.",
  "НЕ ДУБЛИРОВАТЬ ТЕКСТ: каждый пункт должен давать новый смысл; не повторять одну мысль в заголовке, подписи, пункте и CTA.",
  "CTA НА ИЗОБРАЖЕНИИ ЗАПРЕЩЕН: не рисовать кнопки, стрелки действия, нижние плашки, 'узнайте больше', 'сохраните', 'закажите', 'в описании', 'в профиле' или любые призывы к действию.",
  "НЕ ПЕРЕГРУЖАТЬ МАКЕТ ХАОСОМ: допускается плотная шпаргалка на 4-6 блоков, но блоки должны быть короткими, крупными и разделенными. Не делать случайные фото, длинные таблицы и нечитаемую мелкую кашу.",
  "НЕ ИСПОЛЬЗОВАТЬ ТЕХНИЧЕСКИЕ ЗАГОЛОВКИ: не писать на изображении слова 'метафора', 'боль', 'причина', 'действие', 'слой анализа', 'лайфхак', 'инсайт', 'вывод' как названия блоков.",
  "НИЖНИЕ ЗАЩИТНЫЕ ПОДПИСИ ЗАПРЕЩЕНЫ: не рисовать футер, сноску, дисклеймер, 'проверенный БАД', артикул, сертификацию, предупреждение или строку 'проконсультируйтесь'.",
  "Дисклеймеры не являются контентом: не превращать 'не является лекарством', 'не является медицинским диагнозом', 'проконсультируйтесь с врачом' в пункты, бейджи, карточки, преимущества, футеры или нижние строки.",
  "Для БАДов, wellness, витаминов, косметики и похожих продуктов не рисовать дисклеймер вообще; ограничения нужны только как внутреннее правило безопасности.",
  "Не называть БАД, wellness-продукт, косметику или нутрицевтик лекарством, препаратом, лечением, терапией или медицинским средством.",
  "Не писать медицинские диагнозы как утверждение о зрителе и не использовать диагнозы ради драматизации."
];

const productDataRules = [
  "АНКЕТА ПРОДУКТА — ИСТОЧНИК ИСТИНЫ: описание, когда нужно, что можно обещать, факты, состав и запреты важнее AI-брифа, темы, хуков и дизайн-референса.",
  "Видимые обещания, свойства, состав, формат, объем, бренд, дозировка и сценарии продукта можно писать только если они прямо есть в анкете продукта или product reference prompt.",
  "Не добавлять типовые БАД-обещания и соседние claims вроде иммунитета, акне, кишечника, похудения, детокса, энергии, капсул, 60 капсул или 500 мл, если этого нет в анкете продукта.",
  "Поля 'Что нельзя обещать', restrictions, forbidden и contentRestrictions — только внутренние стоп-правила. Не рисовать их на изображении, не превращать в нижний дисклеймер и не пересказывать зрителю.",
  "Если данных продукта мало, лучше сделать полезный бытовой пост вокруг ситуации, чем выдумывать свойства продукта."
];

export function getProductsForProject(products, projectId) {
  return products.filter((product) => product.projectId === projectId);
}

export function buildImagePrompt({ project, product, reference, character, generationBrief = {}, freePrompt, existingJobs = [] }) {
  const pains = product.pains.join(", ");
  const facts = product.facts.join("; ");
  const forbidden = product.forbidden.join("; ");
  const productRefs = (product.references || []).map((item) => `${item.title}: ${item.promptComment || item.imageName}`).join("; ");
  const remoteProductRefs = (product.references || []).filter((item) => isRemoteImageUrl(item.imageData)).length;
  const localProductRefs = (product.references || []).filter((item) => item.imageData && !isRemoteImageUrl(item.imageData)).length;
  const extra = freePrompt ? `Дополнительная задача: ${freePrompt}.` : "";
  const brief = createAutoGenerationBrief({ project, product, reference, generationBrief, existingJobs });
  const plan = createSemanticPlan({ project, product, brief });
  const profile = buildProductProfile({ project, product, insightMap: brief.productInsightMap });
  const visiblePoints = getVisibleImagePoints(plan.points);
  const visiblePointCount = String(visiblePoints.length);
  const visiblePointSource = formatVisiblePointSource(visiblePoints);
  const designCopyPrompt = cleanDesignReferenceText(reference?.takeaways);
  const fixedFontStyle = reference?.fontStyle || reference?.headlineStyle || "";
  const compositionInstruction = getCompositionInstruction(brief.compositionMode);

  return [
    "GPT Image 2: создай вертикальную рекламную инфографику 9:16.",
    "КРИТИЧНО: если переданы reference images, использовать их как главный источник визуального дизайна: палитра, типографика, свет, контраст, форма карточек, материалы, фактуры и ритм.",
    "Дизайн-референс использовать только как визуальный стиль; не копировать его текст, смысл, продукт, логотипы, персонажа или обещания.",
    ...designReferenceRules,
    ...buildDesignReferenceConsistencyInstructions(reference),
    ...socialSafeZoneRules,
    "Не добавлять аватара/персонажа в саму картинку. Персонаж будет наложен отдельно на этапе видео.",
    "Смыслы и формулировки создать только на основе компании, ЦА, выбранного продукта и брифа генерации.",
    compositionInstruction,
    getContentLayerInstruction(brief.contentLayer),
    ...productVisibilityRules,
    getProductReferenceTransferInstruction({ remoteProductRefs, localProductRefs, productVisualMode: brief.productVisualMode }),
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
    `Формат смыслов: ${brief.format}; количество видимых пунктов: ${visiblePointCount}, больше не добавлять.`,
    `Главный визуальный объект: ${brief.visualObject}.`,
    getScenarioVisualInstruction(brief),
    reference?.id === "viral-pink-symptoms" ? "ОБЯЗАТЕЛЬНЫЙ СТИЛЬ РЕФЕРЕНСА: не делать чистый corporate SaaS poster. Нужна viral Reels-инфографика как референс: розово-персиковый фон, верхняя hot-pink glow-плашка с белым текстом и черной обводкой, большой serif-тезис ниже, плотная колонка коротких пунктов с 3D-иконками слева, крупный 3D-объект справа. Без персонажа в картинке; нижнюю часть держать чистой для будущего видео-оверлея." : "",
    `Tone of voice: ${project.toneOfVoice || "экспертный"}. Визуальный стиль брать из выбранного дизайн-референса, а не из текстового поля проекта.`,
    project.projectTheme ? `Тема проекта: ${project.projectTheme}.` : "",
    project.niche ? `Ниша: ${project.niche}.` : "",
    project.keyScenarios ? `Сценарные кластеры: ${project.keyScenarios}.` : "",
    project.audiencePains ? `Боли аудитории: ${project.audiencePains}.` : "",
    project.audienceDesires ? `Желания аудитории: ${project.audienceDesires}.` : "",
    project.audienceObjections ? `Возражения аудитории: ${project.audienceObjections}.` : "",
    project.allowedTriggers ? `Разрешенные триггеры: ${project.allowedTriggers}.` : "",
    project.forbiddenTriggers ? `Запрещенные триггеры: ${project.forbiddenTriggers}.` : "",
    project.hookAggression ? `Степень агрессивности хуков: ${project.hookAggression}.` : "",
    project.contentRestrictions ? `Контентные ограничения: ${project.contentRestrictions}.` : "",
    project.companyInfo ? `Компания: ${project.companyInfo}.` : "",
    project.companyAudience ? `ЦА компании: ${project.companyAudience}.` : "",
    project.restrictions ? `Ограничения проекта: ${project.restrictions}.` : "",
    formatProductInsightPrompt(profile),
    `Референс подачи: ${reference?.title || "лучший проектный инфографический стиль"}.`,
    designCopyPrompt ? `Дополнительная визуальная инструкция к копированию дизайна: ${designCopyPrompt}.` : "",
    reference?.avoidCopy ? `Что НЕ копировать из референса: ${reference.avoidCopy}.` : "",
    reference?.palette ? `Палитра как ориентир: ${reference.palette}.` : "",
    fixedFontStyle ? `ФИКСИРОВАННЫЙ ШРИФТ СТИЛЯ: во всех генерациях с этим дизайн-референсом использовать одну и ту же типографику: ${fixedFontStyle}. Не менять семейство, характер, вес, контраст и обводку шрифта между вариантами.` : "",
    reference?.headlineStyle ? `Стиль заголовка: ${reference.headlineStyle}.` : "",
    reference?.textDensity ? `Плотность текста: ${reference.textDensity}.` : "",
    "Аватар/персонаж: не рисовать и не встраивать в изображение.",
    `Продукт: ${product.name}. ${product.description ? `Описание: ${product.description}.` : ""}`,
    product.components ? `Состав или активные компоненты: ${product.components}.` : "",
    productRefs ? `Референсы продукта: ${productRefs}.` : "",
    `Боли: ${pains}. Оффер: ${product.offer}.`,
    `Факты, которые можно использовать: ${facts}.`,
    `Запрещено обещать: ${forbidden}.`,
    `Уровень продающего текста: ${brief.salesLevel}.`,
    brief.notes ? `Комментарий к генерации: ${brief.notes}.` : "",
    brief.aiPlan?.hookPsychology ? `Внутренняя логика хука: ${brief.aiPlan.hookPsychology}` : "",
    "Текст короткий, крупный, без мелкой каши. Не придумывай медицинские/финансовые гарантии. Не добавляй неуказанные проценты, комиссии, баланс карты или фейковые UI-данные.",
    "ПЕРЕД ОТВЕТОМ проверь: все слова, которые ты рисуешь на изображении, написаны по-русски; английский UI/text запрещен.",
    extra
  ].filter(Boolean).join(" ");
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
  const brief = createAutoGenerationBrief({ project, product, reference, generationBrief, existingJobs });
  const inputReferences = getGenerationInputReferences({ reference, product, productVisualMode: brief.productVisualMode });
  return {
    id: `job-${Math.floor(200 + Math.random() * 700)}`,
    projectId: project.id,
    productId: product.id,
    characterId: character?.id || noAvatarCharacterId,
    status: "queued",
    stage: generationStages[0],
    progress: 6,
    title: brief.hook,
    music: audio?.title || pickAudio(project),
    prompt: buildImagePrompt({ project, product, reference, character, generationBrief: brief, freePrompt, existingJobs }),
    referenceTitle: reference?.title || "",
    inputUrls: inputReferences.map((item) => item.url),
    inputRefs: inputReferences.map(({ role, title, isLocalData }) => ({ role, title, isLocalData })),
    outputType: "final-video",
    finalVideoUrl: "",
    finalVideoHasAudio: false,
    topic: brief.topic,
    semanticKey: brief.semanticKey,
    meaningPatternId: brief.meaningPatternId,
    productVisualMode: brief.productVisualMode,
    compositionMode: brief.compositionMode?.id || "",
    diversitySlot: brief.diversitySlot,
    contentLayerId: brief.contentLayerId,
    format: brief.format
  };
}

export function getGenerationInputUrls({ reference, character, product }) {
  return getGenerationInputReferences({ reference, character, product }).map((item) => item.url);
}

export function getGenerationInputReferences({ reference, product, productVisualMode = "exact-product" }) {
  return [
    ...(productVisualMode === "exact-product" ? (product.references || []).map((item) => ({
      role: "product",
      title: item.title || item.imageName || "Product reference",
      url: item.imageData
    })) : []),
    {
      role: "design",
      title: reference?.title || "Design reference",
      url: reference?.imageData
    }
  ]
    .filter((item) => isImageReferenceUrl(item.url))
    .map((item) => ({ ...item, isLocalData: isDataImageUrl(item.url) }))
    .slice(0, 16);
}

function isRemoteImageUrl(value) {
  return /^https?:\/\//.test(String(value || ""));
}

function isDataImageUrl(value) {
  return /^data:image\/(?:png|jpe?g|webp);base64,/i.test(String(value || ""));
}

function isImageReferenceUrl(value) {
  return isRemoteImageUrl(value) || isDataImageUrl(value);
}

function getProductReferenceTransferInstruction({ remoteProductRefs, localProductRefs, productVisualMode }) {
  const productRefCount = remoteProductRefs + localProductRefs;
  if (productVisualMode === "exact-product" && productRefCount) {
    return [
      `РЕЖИМ ПРОДУКТА: exact-product. Передано ${productRefCount} product reference image(s).`,
      "Локальные product reference images будут опубликованы как S3/public URL перед запросом к генератору; считай их доступными для image-to-image.",
      "Тема требует показать продукт: продукт должен быть визуально виден в кадре.",
      "Копируй внешний вид продукта из product reference: форму упаковки, цвет, этикетку, название, крышку, коробку и SKU; не заменяй его абстрактным 3D-объектом, generic bottle, generic jar, flask или чужой упаковкой."
    ].join(" ");
  }
  return [
    "РЕЖИМ ПРОДУКТА: no-package.",
    "Не показывать упаковку продукта вообще.",
    "Не рисовать никакую банку, флакон, коробку, капсулы, бутылку, баночку, блистер, тюбик или похожий generic product object.",
    "Если точный продукт не обязателен по теме, показывать только ситуацию, ингредиент, ритуал, интерфейс, предмет боли или абстрактный объект без упаковки."
  ].join(" ");
}

function getProductVisualMode({ product, topic, hook, visualObject }) {
  const hasProductReference = Array.isArray(product?.references) && product.references.some((item) => isImageReferenceUrl(item?.imageData));
  if (!hasProductReference) return "no-package";
  const source = `${topic || ""} ${hook || ""} ${visualObject || ""}`.toLowerCase();
  return /продукт|упаков|состав|этикет|как пить|как приним|прием|принимать|дозиров|курс|банка|флакон|капсул|таблет|выбор|что внутри|обзор/.test(source)
    ? "exact-product"
    : "no-package";
}

function getVisibleImagePoints(points) {
  const source = Array.isArray(points) ? points.filter(Boolean) : [];
  return source.slice(0, 6);
}

function formatVisiblePointSource(points) {
  return points.map((point) => String(point).replace(/\s+/g, " ").trim()).join(" | ");
}

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
  const slot = generationBrief.diversitySlot || createContentSlot({ project, product, existingJobs });
  const topicCandidate = !generationBrief.topic && !generationBrief.hook && !isPaymentProject(project)
    ? pickTopicCandidate({ project, product, existingJobs, insightMap: generationBrief.productInsightMap })
    : null;
  const topicCandidatePlan = !generationBrief.aiPlan && topicCandidate
    ? createTopicCandidatePlan({ project, product, candidate: topicCandidate })
    : null;
  const generationSeed = {
    ...generationBrief,
    diversitySlot: slot,
    topic: generationBrief.topic || topicCandidate?.topic || "",
    hook: generationBrief.hook || topicCandidate?.hook || "",
    format: generationBrief.format || topicCandidate?.format || "",
    aiPlan: generationBrief.aiPlan || topicCandidatePlan || undefined
  };
  const meaning = createMeaningBrief({ project, product, reference, generationBrief: generationSeed, existingJobs });
  const scenario = generationBrief.topic ? "" : pickNextScenario({ project, product, existingJobs });
  const desire = firstLine(project.audienceDesires) || product.offer || product.name;
  const fact = firstListItem(product.facts) || product.description || project.projectTheme;
  const topic = generationSeed.topic || meaning.topic || slot.topic || scenario || project.projectTheme || `${product.name}: полезная инфографика`;
  const paymentHook = isPaymentProject(project) ? buildAutoHook({ project, product, topic, fact, desire, existingJobs }) : "";
  const referenceHook = meaning.hookReference ? meaning.hook : "";
  const hook = referenceHook || generationSeed.hook || paymentHook || meaning.hook || slot.hook || buildAutoHook({ project, product, topic, fact, desire, existingJobs });
  const hookPointCount = getHookPointCount(meaning.hookReference?.text || hook);
  const profile = buildProductProfile({ project, product, insightMap: generationBrief.productInsightMap });
  const brief = {
    topic,
    hook,
    format: generationSeed.format || meaning.format || slot.format || pickFormat(project, reference),
    pointCount: hookPointCount || generationBrief.pointCount || pickPointCount(product),
    visualObject: generationBrief.visualObject || profile.primaryVisual || meaning.visualObject || slot.visualObject || reference?.visualObject || product.components || product.name,
    cta: generationBrief.cta || "",
    salesLevel: generationBrief.salesLevel || "expert",
    notes: meaning.notes || `Контентный слот: ${slot.angle || slot.id}. Автоматически собрать смыслы из проекта, ЦА, продукта и выбранного референса.`,
    semanticKey: generationBrief.semanticKey || slot.id,
    meaningPatternId: meaning.pattern.id,
    hookReference: meaning.hookReference || null,
    meaningScore: scoreMeaningBrief({ brief: meaning, project }),
    topicCandidate,
    diversitySlot: slot,
    contentLayer: slot.contentLayer || generationBrief.contentLayer || null,
    contentLayerId: slot.contentLayer?.id || generationBrief.contentLayerId || "",
    compositionMode: generationBrief.compositionMode || pickCompositionMode({
      format: generationSeed.format || meaning.format || slot.format || pickFormat(project, reference),
      existingJobs
    }),
    productInsightMap: profile.insightMap,
    aiPlan: generationSeed.aiPlan,
    productVisualMode: generationBrief.productVisualMode || getProductVisualMode({
      product,
      topic,
      hook,
      visualObject: generationBrief.visualObject || profile.primaryVisual || meaning.visualObject || slot.visualObject || reference?.visualObject || product.components || product.name
    })
  };
  return brief;
}

function getHookPointCount(value) {
  const match = String(value || "").match(/\b([3-9])\b/);
  return match ? match[1] : "";
}

export function createSemanticPlan({ project, product, brief }) {
  if (isPaymentProject(project)) return createPaymentPlan({ product, brief });
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
  const daily = getSingleLimitState(project.dailyLimit, project.usedToday);
  const total = getSingleLimitState(project.projectLimit ?? project.dailyLimit, project.usedTotal ?? project.usedToday);
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

function pickHook(productName) {
  const starter = hookStarters[Math.floor(Math.random() * hookStarters.length)];
  return `${starter}: ${productName}`;
}

function buildAutoHook({ project, product, topic, fact, desire, existingJobs = [] }) {
  const source = `${project.niche || ""} ${project.projectTheme || ""}`.toLowerCase();
  if (/финтех|оплат|зарубеж|банк|санкци|рубл/.test(source)) return pickUniqueHook([
    `Что делать, если зарубежный сервис не принимает вашу карту`,
    `Как оплатить подписку за рубежом без хаоса`,
    `Почему платеж за границей может не пройти с первого раза`,
    `Как заранее проверить условия зарубежной оплаты`,
    `Где чаще всего ломается оплата зарубежных сервисов`,
    `Как оплатить зарубежный счет понятным маршрутом`,
    `Что важно знать перед оплатой иностранной подписки`
  ], existingJobs);
  if (/beauty|космет|кожа|уход/.test(source)) return `Что проверить в уходе перед покупкой`;
  if (/бад|wellness|нутрицевтик/.test(source)) return `Что важно знать перед приемом`;
  return `${topic || desire || fact || product.name}`;
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
  return candidates.find((item) => !used.has(normalizeText(item)))
    || candidates[existingJobs.length % candidates.length];
}

function lines(value) {
  return String(value || "").split(/\n|;/).map((item) => item.trim()).filter(Boolean);
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function isPaymentProject(project) {
  const source = `${project.niche || ""} ${project.projectTheme || ""} ${project.companyInfo || ""}`.toLowerCase();
  return /финтех|оплат|зарубеж|банк|санкци|рубл|подпис|сервис/.test(source);
}

function pickFormat(project, reference) {
  const source = `${project.allowedTriggers || ""} ${project.keyScenarios || ""}`.toLowerCase();
  if (/ошибк/.test(source)) return "mistake-solution";
  if (/чеклист|провер/.test(source)) return "checklist";
  if (/сравн/.test(source)) return "comparison";
  return reference?.layoutType || "checklist";
}

function pickPointCount(product) {
  const count = Math.max(product.pains?.length || 0, product.facts?.length || 0);
  return String(Math.min(6, Math.max(4, count || 5)));
}

function firstLine(value) {
  return String(value || "").split(/\n/).map((item) => item.trim()).find(Boolean) || "";
}

function firstListItem(value) {
  return Array.isArray(value) ? value.find(Boolean) || "" : firstLine(value);
}

function getSafeDisclaimer(project) {
  if (isPaymentProject(project)) return "Итог зависит от правил площадки, страны и актуальных условий платежа";
  return project.restrictions || "Информация не заменяет консультацию специалиста; проверяйте условия и ограничения";
}

function pickAudio(project) {
  return project.audioLibrary?.[0]?.title || "Project audio random";
}
