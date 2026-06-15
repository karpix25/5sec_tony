const openRouterUrl = "https://openrouter.ai/api/v1/chat/completions";
const visionModel = "qwen/qwen3.5-9b";
const writingModel = "google/gemini-3.1-flash-lite";
const defaultOpenRouterTimeoutMs = Number(process.env.OPENROUTER_TIMEOUT_MS || 120000);
const productVisionTimeoutMs = Number(process.env.PRODUCT_VISION_TIMEOUT_MS || 180000);

export async function handleOpenRouterApi(request, response, url) {
  if (request.method === "POST" && url.pathname === "/api/products/analyze") {
    return analyzeProductPhotos(request, response);
  }
  if (request.method === "POST" && url.pathname === "/api/project/generate-field") {
    return generateProjectField(request, response);
  }
  if (request.method === "POST" && url.pathname === "/api/project/audience-expert") {
    return generateAudienceExpert(request, response);
  }
  if (request.method === "POST" && url.pathname === "/api/generation/brief") {
    return generateBrief(request, response);
  }
  if (request.method === "POST" && url.pathname === "/api/generation/humanize") {
    return humanizeGenerationText(request, response);
  }
  if (request.method === "POST" && url.pathname === "/api/hooks/extract") {
    return extractHooks(request, response);
  }
  return false;
}

async function extractHooks(request, response) {
  try {
    const token = process.env.OPENROUTER_API_KEY;
    if (!token) return sendJson(response, 500, { error: "OPENROUTER_API_KEY is not configured" });
    const body = await readJson(request);
    if (!body.imageData) return sendJson(response, 400, { error: "Нужно загрузить скрин с хуками" });
    const content = await callOpenRouter(token, visionModel, [
      {
        role: "user",
        content: [
          { type: "text", text: hookExtractInstruction(body) },
          { type: "image_url", image_url: { url: body.imageData } }
        ]
      }
    ]);
    const draft = parseJsonDraft(content);
    return sendJson(response, 200, { model: visionModel, hooks: Array.isArray(draft.hooks) ? draft.hooks : [] });
  } catch (error) {
    return sendJson(response, 502, { error: error.message || "OpenRouter hook extraction failed" });
  }
}

async function generateAudienceExpert(request, response) {
  try {
    const token = process.env.OPENROUTER_API_KEY;
    if (!token) return sendJson(response, 500, { error: "OPENROUTER_API_KEY is not configured" });
    const body = await readJson(request);
    const content = await callOpenRouter(token, writingModel, [
      { role: "system", content: "Ты senior audience strategist и редактор performance-контента. Пиши по-русски. Верни только JSON без markdown." },
      { role: "user", content: audienceExpertInstruction(body) }
    ]);
    return sendJson(response, 200, { model: writingModel, draft: parseJsonDraft(content) });
  } catch (error) {
    return sendJson(response, 502, { error: error.message || "OpenRouter audience expert failed" });
  }
}

async function generateBrief(request, response) {
  try {
    const token = process.env.OPENROUTER_API_KEY;
    if (!token) return sendJson(response, 500, { error: "OPENROUTER_API_KEY is not configured" });
    const body = await readJson(request);
    logGenerationPayload("brief", body);
    const content = await callOpenRouter(token, writingModel, [
      { role: "system", content: "Ты senior creative strategist для performance-инфографик. Пиши по-русски. Верни только JSON без markdown." },
      { role: "user", content: generationBriefInstruction(body) }
    ]);
    return sendJson(response, 200, { model: writingModel, draft: parseJsonDraft(content) });
  } catch (error) {
    return sendJson(response, 502, { error: error.message || "OpenRouter request failed" });
  }
}

async function humanizeGenerationText(request, response) {
  try {
    const token = process.env.OPENROUTER_API_KEY;
    if (!token) return sendJson(response, 500, { error: "OPENROUTER_API_KEY is not configured" });
    const body = await readJson(request);
    logGenerationPayload("humanize", body);
    const content = await callOpenRouter(token, writingModel, [
      { role: "system", content: "Ты редактор массовых Reels-инфографик. Пиши по-русски, просто, живо и безопасно. Верни только JSON без markdown." },
      { role: "user", content: humanizeTextInstruction(body) }
    ]);
    return sendJson(response, 200, { model: writingModel, draft: parseJsonDraft(content) });
  } catch (error) {
    return sendJson(response, 502, { error: error.message || "OpenRouter text humanizer failed" });
  }
}

async function generateProjectField(request, response) {
  try {
    const token = process.env.OPENROUTER_API_KEY;
    if (!token) return sendJson(response, 500, { error: "OPENROUTER_API_KEY is not configured" });
    const body = await readJson(request);
    const content = await callOpenRouter(token, writingModel, [
      { role: "system", content: "Ты стратег контента. Пиши по-русски, конкретно, без выдуманных фактов и запрещенных обещаний. Верни только JSON вида {\"value\":\"...\"}." },
      { role: "user", content: projectFieldInstruction(body) }
    ]);
    const draft = parseJsonDraft(content);
    return sendJson(response, 200, { model: writingModel, value: draft.value || String(content).trim() });
  } catch (error) {
    return sendJson(response, 502, { error: error.message || "OpenRouter request failed" });
  }
}

async function analyzeProductPhotos(request, response) {
  try {
    const token = process.env.OPENROUTER_API_KEY;
    if (!token) return sendJson(response, 500, { error: "OPENROUTER_API_KEY is not configured" });

    const body = await readJson(request);
    const images = Array.isArray(body.images) ? body.images.slice(0, 8) : [];
    if (!images.length) return sendJson(response, 400, { error: "Нужно загрузить хотя бы одно фото продукта" });

    const visual = await callOpenRouter(token, visionModel, [
      {
        role: "user",
        content: [
          { type: "text", text: productVisionInstruction(body) },
          ...images.map((image) => ({ type: "image_url", image_url: { url: image.dataUrl } }))
        ]
      }
    ], { timeoutMs: productVisionTimeoutMs });
    const draft = await callOpenRouter(token, writingModel, [
      { role: "system", content: "Ты продуктовый редактор. Пиши по-русски, кратко, без медицинских, финансовых и юридических гарантий. Возвращай только JSON." },
      { role: "user", content: productWritingInstruction(body, visual) }
    ]);

    return sendJson(response, 200, {
      modelAnalysis: visionModel,
      modelWriting: writingModel,
      draft: parseJsonDraft(draft),
      raw: { visual, draft }
    });
  } catch (error) {
    return sendJson(response, 502, { error: error.message || "OpenRouter request failed" });
  }
}

function audienceExpertInstruction(body) {
  return JSON.stringify({
    task: "Создай профессиональную смысловую базу проекта для массовой автогенерации коротких вертикальных инфографик.",
    modelRole: [
      "Думай как эксперт по аудитории, performance-креативам и безопасным триггерным хукам.",
      "Твоя задача — заполнить не одну тему, а карту аудитории, из которой можно делать тысячи неповторяющихся видео.",
      "Если данных мало, помечай гипотезы, но все равно дай рабочую структуру."
    ],
    output: {
      niche: "точная ниша проекта без воды",
      companyAudience: "2-5 сегментов ЦА: кто они, что уже понимают, чего боятся, на каком этапе решения",
      keyScenarios: ["8-14 широких сценарных кластеров, не конкретных тем"],
      audiencePains: ["широкие боли и ситуации, которые человек узнает за 1 секунду"],
      audienceDesires: ["желания, результаты, состояние после решения, без недоказанных гарантий"],
      audienceObjections: ["почему не верят, не покупают, откладывают, сомневаются"],
      allowedTriggers: ["триггеры, которые можно использовать в этой нише"],
      forbiddenTriggers: ["опасные, незаконные, токсичные или репутационно плохие триггеры"],
      hookAggression: "низкая | средняя | высокая + короткое объяснение допустимого уровня",
      contentRestrictions: ["факты и ограничения для генерации смыслов и изображений"],
      toneOfVoice: "тон коммуникации проекта",
      restrictions: ["что нельзя обещать и как формулировать безопасно"]
    },
    rules: [
      "Опирайся на текущие значения draft: это свежие несохраненные данные пользователя.",
      "Старые продукты и демо-данные используй только если они не конфликтуют с темой проекта.",
      "Пиши конкретно для проекта, но универсально по продуктам внутри проекта.",
      "Не обещай лечение, финансовый результат, обход правил, гарантированный эффект или юридическую защиту.",
      "Не используй слова 'обход', 'обойти', 'обходить' как нормальное действие проекта; такие слова можно упоминать только в forbiddenTriggers или restrictions как запрещенную лексику.",
      "Сценарные кластеры должны быть большими корзинами смыслов: боль, ошибка, риск, сравнение, срочность, недоверие, выбор, проверка.",
      "Боли должны быть массовыми и понятными, в стиле цепляющего редактора: деньги зря, доступ сгорит, не туда ведут, поздно понял, скрытая ошибка.",
      "Не делай сухие экспертные формулировки вроде 'повысить осведомленность'."
    ],
    project: body.project,
    draft: body.draft,
    products: body.products
  });
}

function productVisionInstruction(body) {
  return [
    "Проанализируй фото продукта, услуги, упаковки, этикетки, скриншоты или любые загруженные материалы.",
    "Извлеки только то, что видно на фото. Не выдумывай состав, дозировки и обещания.",
    `Текущий продукт: ${body.product?.name || "не указан"}.`,
    "Верни наблюдения: категория, название, формат, видимые компоненты или детали, надписи, предупреждения, факты, ограничения, визуальные особенности."
  ].join("\n");
}

function productWritingInstruction(body, visual) {
  return JSON.stringify({
    task: "На основе анализа фото и контекста проекта заполни универсальную карточку продукта. Она должна подходить для БАДов, косметики, услуг, образования, финансовых, бытовых и других ниш.",
    rules: [
      "Сначала определи категорию по фото и контексту, затем пиши поля языком этой категории.",
      "Не выдумывай состав, сертификаты, цифры, сроки, гарантии и юридические факты.",
      "Если данных мало, формулируй осторожно: 'можно использовать как гипотезу' или 'требует проверки'.",
      "Избегай медицинских, финансовых, юридических и косметологических гарантий.",
      "Для БАДов, wellness, витаминов и косметики не называй продукт лекарством, препаратом, лечением, терапией или медицинским средством.",
      "В promptComment фиксируй реальный внешний вид: форму упаковки, цвет, этикетку, название, крышку, коробку и объем. Не предлагай ребрендинг или новую упаковку."
    ],
    output: {
      description: "Что это? Категория, формат, назначение и понятное описание.",
      offer: "Что можно обещать? Аккуратная польза или результат без недоказанных гарантий.",
      components: "Внутреннее поле: состав, детали, этапы, комплектация или механизм, только если это видно или известно.",
      pains: ["Когда нужно? Ситуации, задачи, боли, желания или сценарии аудитории."],
      facts: ["Факты: видимые надписи, состав, формат, этапы, ограничения, проверяемые детали."],
      forbidden: ["Что нельзя обещать? Запрещенные заявления, рисковые формулировки, гарантии."],
      promptComment: "как использовать фото продукта как референс для генерации изображения"
    },
    project: body.project,
    product: body.product,
    visualAnalysis: visual
  });
}

function projectFieldInstruction(body) {
  return JSON.stringify({
    task: "Заполни одно стратегическое поле проекта для автогенерации тем и инфографик.",
    fieldName: body.fieldName,
    fieldLabel: body.fieldLabel,
    priority: [
      "Главный источник истины — текущие значения формы project/draft, даже если пользователь еще не нажал сохранить.",
      "Если текущая тема проекта противоречит старым продуктам или демо-данным, верь теме проекта, компании и ЦА.",
      "Продукты используй как дополнительный контекст только когда они не конфликтуют с текущей формой."
    ],
    rules: [
      "Используй только данные проекта и продуктов.",
      "Если данных мало, помечай формулировки как гипотезы.",
      "Не обещай лечение, финансовые гарантии, юридический результат или недоказанный эффект.",
      "Ответ должен быть полезным как поле памяти проекта."
    ],
    specialRule: body.fieldName === "keyScenarios"
      ? "Это поле называется Сценарные кластеры. Верни 5-15 больших ситуаций/кластеров, из которых система сможет генерировать сотни неповторяющихся тем. Не перечисляй все будущие темы. Формат: короткие строки, каждая строка = один кластер."
      : "",
    project: body.project,
    draft: body.draft,
    products: body.products
  });
}

function generationBriefInstruction(body) {
  return JSON.stringify({
    task: "Создай уникальный бриф для одной вертикальной 9:16 инфографики. Бриф должен подходить любому проекту, не только текущей нише.",
    mandatorySlot: body.diversitySlot,
    output: {
      semanticKey: "ровно id из mandatorySlot",
      topic: "конкретная бытовая боль, лайфхак или полезный факт на сегодня, не похожий на recentJobs",
      hook: "короткий хук простым языком: что человек чувствует, теряет или может проверить прямо сегодня",
      format: "symptoms | scheme | checklist | product-stack | mistake-solution | comparison",
      pointCount: "3",
      visualObject: "главный объект изображения",
      cta: "всегда пустая строка",
      plan: {
        headline: "человечный заголовок: конкретная боль или полезная проверка, 4-9 слов",
        subhead: "одна простая строка: где это проявляется сегодня",
        points: ["ровно 3 пункта: 1 боль/ситуация, 2 причина простыми словами, 3 лайфхак или мягкий следующий шаг"],
        disclaimer: "пустая строка для БАДов/wellness/косметики; короткое ограничение только если оно реально нужно для другой ниши"
      }
    },
    rules: [
      "MandatorySlot обязателен: topic, hook, format, visualObject и plan должны раскрывать именно этот angle, а не соседний сценарий.",
      "MandatorySlot.contentLayer обязателен: сначала сделай анализ через этот слой, затем собери тему, хук и пункты.",
      "Работай в несколько слоев: 1) боль аудитории, 2) бытовая ситуация, 3) лайфхак или совет, 4) смежная тема вокруг продукта, 5) мягкая роль продукта как решения.",
      "Тема не обязана напрямую повторять продукт. Можно идти рядом: привычки, ошибки, режим, контекст, выбор, симптомы ситуации, бытовые решения и полезные наблюдения.",
      "Все поля topic, hook, visualObject, cta, plan.subhead, plan.points и plan.disclaimer пиши только на русском; английские слова и латиницу переводи на русский, кроме официальных названий брендов и сервисов.",
      "CTA не нужен: верни cta пустой строкой и не добавляй призывы 'узнайте', 'сохраните', 'закажите', 'в описании', 'в профиле' в headline, subhead или points.",
      "Не перегружай карточку: ровно 3 пункта, один главный визуальный ход, без таблиц на 5-7 строк, без многоэтажных VS-сеток и без набора случайных фото.",
      "Не повторяй recentJobs по теме, смысловому углу, структуре и формулировкам.",
      "Если recentJobs уже про оплату подписки, не делай новую тему про оплату подписки; выбери другой объект из mandatorySlot.",
      "Если recentJobs уже про отказ карты, не делай новую тему про отказ карты; выбери другой объект из mandatorySlot.",
      "Опирайся на project, product и выбранный reference.",
      "Анкета product — источник истины. Не добавляй свойства, обещания, формат, состав, объем, дозировку, бренд или упаковку, которых нет в product.description, product.offer, product.components, product.pains, product.facts или product.references.",
      "Не расширяй продукт типовыми claims ниши: иммунитет, акне, кишечник, похудение, детокс, энергия, капсулы, 60 капсул, 500 мл и похожее можно использовать только если это прямо есть в анкете продукта.",
      "Не выбирай упаковку как visualObject по умолчанию. Упаковка нужна только если тема прямо про продукт, выбор, применение, состав или есть точный product reference. Чаще показывай ритуал, ингредиент, стакан, ситуацию, проблему или маленький продуктовый сигнал.",
      "Продукт не должен быть в каждом посте. Если тема бытовая или образовательная, продукт может быть только контекстом в смысле, без крупной упаковки в кадре.",
      "Главная ценность инфографики — интересный факт или жизненное наблюдение, а не рекламный текст. Человек должен подумать: 'полезно, сохраню или отправлю другу'.",
      "Тему бери из обычной жизни аудитории: сон, стресс, усталость, деньги, доступ, поездка, рабочий дедлайн, привычка, ошибка в рутине, выбор перед покупкой.",
      "Если продукт является решением, сначала подними боль, которую он закрывает, и только потом мягко покажи продукт как один из понятных следующих шагов.",
      "Если прямой связи с продуктом мало, комбинируй вокруг: боль -> привычка -> бытовой совет -> смежный факт -> спокойный вывод.",
      "Обязательно сделай мост к продукту: 1 короткая мысль, почему именно этот продукт уместен в теме. Без моста тема считается слабой.",
      "Не называй БАД, wellness-продукт, витамин, косметику или нутрицевтик лекарством, препаратом, лечением, терапией или медицинским средством.",
      "Не используй технические заголовки внутри текста: 'метафора', 'боль', 'причина', 'действие', 'слой анализа', 'лайфхак', 'инсайт', 'вывод'. Это внутренние роли, не текст для картинки.",
      "Не повторяй одну мысль разными словами. Каждый пункт должен добавлять новый смысл.",
      "Не добавляй в points дисклеймеры вроде 'не является лекарственным средством', 'не является медицинским диагнозом', 'проконсультируйтесь с врачом'.",
      "Для БАДов, wellness, витаминов, косметики и похожих продуктов верни disclaimer пустой строкой. Не рисуй дисклеймер на изображении.",
      "Поля forbidden, restrictions и contentRestrictions — внутренние стоп-правила. Не превращай их в visible copy, points, CTA, disclaimer или нижнюю строку.",
      "Не делай общие советы вроде 'проверьте условия', 'изучите состав', 'обратите внимание'. Каждый пункт должен содержать конкретный факт, симптом ситуации, бытовой пример или причину.",
      "Не выдумывай комиссии, цифры, гарантии, диагнозы, юридические факты и финансовые результаты.",
      "Хук должен работать как заголовок желтой прессы, но без лжи: широкая боль, тревожный конфликт, понятный обычному человеку риск.",
      "Хук должен быть понятным без расшифровки ниже. Не пиши 'одна привычка', 'главная ошибка', 'это', 'секрет' без конкретики внутри заголовка.",
      "Используй найденные Reels-паттерны: один экран — одна мысль, хук читается за 1 секунду, короткие рубленые фразы, обращение к зрителю через 'вы/ты', визуальная классификация, сравнение, метафора или чеклист.",
      "Предпочитай структуры: жизненная ситуация -> неожиданный факт -> что это меняет; боль -> причина -> мягкий следующий шаг; миф -> реальность -> полезный вывод; признаки -> что с этим делать.",
      "Не делай водянистые экспертные заголовки. Нужна понятная массовая боль: потеря времени, доступ сгорит, деньги уйдут зря, вас ведут не туда, вы принимаете норму за проблему или проблему за норму.",
      "Запрещены темы и заголовки вида 'Разбор состава: что внутри и зачем это нужно', 'Анализ состава', 'Как простая метафора объясняет проблему', 'Как популярный миф мешает принятию решений'. Это внутренние форматы, не человеческие темы.",
      "Не пиши пункты вида 'Бренд: SONRE', 'Факт: SONRE', 'Люди верят узнаваемым деталям'. Это не польза для зрителя. Каждый пункт должен отвечать: что я узнаю о себе или что сделать сегодня?",
      "Обязательная проверка перед ответом: headline должен содержать конкретику из жизни: сухость кожи, усталость утром, срыв оплаты, поздний ужин, стресс перед сном, деньги уйдут не туда, доступ может сгореть. Если конкретики нет — перепиши.",
      "Мини-формула текста: 'узнаваемая боль' -> 'простая причина' -> 'лайфхак на сегодня'. Не заменяй ее рекламой продукта или разбором бренда.",
      "Не пиши сухие темы вроде 'что проверить' без боли. Лучше: 'доступ отключится', 'карта снова не проходит', 'бронь может слететь', 'обещают оплатить все — красный флаг'.",
      "Хук должен быть применим к нише проекта, но не быть шаблонным.",
      "Пункты должны образовывать одну цельную историю: узнавание -> простая причина -> что сделать сегодня.",
      "Пункты не должны быть универсальным списком 'выберите сервис, передайте данные, оплатите'; каждый пункт должен быть специфичен mandatorySlot.",
      "Не упоминай имя аватара."
    ],
    project: body.project,
    product: body.product,
    reference: body.reference,
    recentJobs: (body.existingJobs || []).slice(0, 30)
  });
}

function humanizeTextInstruction(body) {
  return JSON.stringify({
    task: "Перепиши финальный текст инфографики человеческим массовым языком перед генерацией картинки.",
    role: [
      "Ты не придумываешь новую тему.",
      "Ты редактор, который переводит сухой экспертный план в понятный Reels-текст.",
      "Текст должен считываться за 1 секунду и попадать в широкую боль аудитории."
    ],
    output: {
      headline: "короткий сильный заголовок, 4-9 слов, широкая боль или полезный факт",
      subhead: "одна простая строка, почему это знакомо в жизни",
      points: ["3-7 коротких пунктов, каждый до 9 слов, факт или бытовой пример"],
      cta: "всегда пустая строка",
      disclaimer: "пустая строка для БАДов/wellness/косметики; короткое ограничение только если оно реально нужно для другой ниши"
    },
    rules: [
      "Сохрани исходный смысл, сценарий и hook reference; не меняй тему на другую.",
      "Все поля headline, subhead, points, cta и disclaimer пиши только на русском; английские слова и латиницу переводи на русский, кроме официальных названий брендов и сервисов.",
      "CTA не нужен: верни cta пустой строкой и убери любые 'узнайте', 'сохраните', 'закажите', 'в описании', 'в профиле' из текста.",
      "Оставь только 3 самых сильных пункта. Не превращай пост в длинную таблицу, набор карточек или рекламный каталог.",
      "Сделай текст полезным для сохранения и пересылки: меньше рекламных обещаний, больше узнаваемых ситуаций, причин и простых фактов.",
      "Анкета product — источник истины. Не добавляй свойства, обещания, формат, состав, объем, дозировку, бренд или упаковку, которых нет в product.",
      "Не расширяй продукт типовыми claims ниши: иммунитет, акне, кишечник, похудение, детокс, энергия, капсулы, 60 капсул, 500 мл и похожее можно использовать только если это прямо есть в анкете продукта.",
      "Сделай headline самодостаточным: человек должен понять конфликт без подписи ниже. Убери туманные формулы вроде 'одна привычка' или 'главная ошибка', если не названа конкретная причина.",
      "Если продукт решает боль, не начинай с продукта. Сначала покажи боль в жизни человека, потом мягкий следующий шаг.",
      "Убери технические подписи вроде 'метафора', 'боль', 'причина', 'действие': замени их на живые короткие фразы.",
      "Убери повторяющиеся дисклеймеры из points. Не пиши 'не является лекарственным средством' и 'не является медицинским диагнозом' как пункты инфографики.",
      "Для БАДов, wellness, витаминов, косметики и похожих продуктов верни disclaimer пустой строкой.",
      "Поля forbidden, restrictions и contentRestrictions — внутренние стоп-правила. Не превращай их в visible copy, points, CTA, disclaimer или нижнюю строку.",
      "Не называй БАД, wellness-продукт, витамин, косметику или нутрицевтик лекарством, препаратом, лечением, терапией или медицинским средством.",
      "Усиль связь продукта с темой одной понятной строкой: какую жизненную ситуацию он закрывает.",
      "Используй простые речевые обороты: деньги ушли зря, доступ сгорит, не туда платите, поздно поняли, условия мутные, обещают быстро, деталей нет.",
      "Замени сухие слова на бытовые: 'invoice' -> 'счет', 'назначение' -> 'за что платите', 'процесс' -> 'что происходит', 'ограничения' -> 'что может не пройти'.",
      "Пиши широкие боли, понятные человеку без экспертизы.",
      "Не добавляй новые цифры, комиссии, гарантии, юридические факты, обход правил, диагнозы или финансовые обещания.",
      "Не используй слишком сложные слова: транзакция, инвойс, верификация, комплаенс, маршрут, если можно проще.",
      "Не делай рекламную воду и пустые команды вроде 'проверьте', 'изучите', 'обратите внимание'. Каждый пункт должен быть конкретным фактом, причиной или примером.",
      "Если в hook reference есть число, сохрани примерно такое количество пунктов, если это помещается.",
      "Сохраняй безопасность: без обещаний оплатить что угодно, обойти правила или гарантировать результат."
    ],
    project: body.project,
    product: body.product,
    hookReference: body.hookReference,
    basePlan: body.plan,
    brief: body.brief,
    restrictions: {
      project: body.project?.restrictions || body.project?.contentRestrictions || "",
      productForbidden: body.product?.forbidden || []
    }
  });
}

function hookExtractInstruction(body) {
  return JSON.stringify({
    task: "Извлеки со скрина только хуки, заголовки и короткие формулы начала ролика.",
    title: body.title || "",
    rules: [
      "Пиши по-русски, если текст на русском; не переводи английские хуки без необходимости.",
      "Не включай длинные абзацы, подписи интерфейса, даты, водяные знаки и имена аккаунтов.",
      "Один элемент массива = один самостоятельный хук.",
      "Сохраняй смысл, но исправляй явные OCR-ошибки."
    ],
    output: { hooks: ["короткий хук"] }
  });
}

async function callOpenRouter(token, model, messages, options = {}) {
  const timeoutMs = options.timeoutMs || defaultOpenRouterTimeoutMs;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const result = await fetch(openRouterUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://127.0.0.1:4173",
        "X-Title": "Anton 5 sec Studio"
      },
      body: JSON.stringify({ model, messages, temperature: 0.25 }),
      signal: controller.signal
    });
    const payload = await result.json().catch(() => ({}));
    if (!result.ok) throw new Error(payload.error?.message || "OpenRouter request failed");
    return payload.choices?.[0]?.message?.content || "";
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`OpenRouter не ответил за ${Math.round(timeoutMs / 1000)} сек. Попробуйте меньше фото или повторите позже.`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function parseJsonDraft(text) {
  const json = String(text).match(/\{[\s\S]*\}/)?.[0] || "{}";
  try {
    return JSON.parse(json);
  } catch {
    return {};
  }
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let data = "";
    request.on("data", (chunk) => {
      data += chunk;
    });
    request.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
  return true;
}

function logGenerationPayload(stage, body) {
  console.log(`[openrouter:${stage}]`, JSON.stringify({
    productId: body.product?.id || "",
    productName: body.product?.name || "",
    projectId: body.project?.id || "",
    reference: body.reference?.title || "",
    slot: body.diversitySlot?.id || body.brief?.semanticKey || ""
  }));
}
