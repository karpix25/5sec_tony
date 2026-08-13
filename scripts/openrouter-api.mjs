import { getOpenRouterErrorMessage, parseJsonDraft, readOpenRouterPayload } from "./openrouter-response.mjs";
import { humanizeTextInstruction, runCreativeTeamBrief } from "./creative-team-prompts.mjs";
import { humanizeCreativeTeamDraft } from "./creative-team-humanizer.mjs";
import { completeCreativeTeamImagePrompt } from "./creative-team-image-prompt.mjs";
import { resolveImageInputUrls } from "./reference-assets.mjs";
import { getVisibleTextContractViolations } from "../src/domain/design-text-contract.js";
import { validateHeadlineSafety } from "../src/domain/attention-frame.js";
const openRouterUrl = "https://openrouter.ai/api/v1/chat/completions";
const visionModel = "qwen/qwen3.5-9b";
const writingModel = "google/gemini-3.1-flash-lite";
const designReferenceModel = writingModel;
const defaultOpenRouterTimeoutMs = Number(process.env.OPENROUTER_TIMEOUT_MS || 120000);
const briefOpenRouterTimeoutMs = Number(process.env.OPENROUTER_BRIEF_TIMEOUT_MS || 45000);
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
    const bodyWithReferenceImages = await attachDesignReferenceImageUrls(body, request);
    const draft = await runCreativeTeamBrief({
      token,
      body: bodyWithReferenceImages,
      model: writingModel,
      referenceModel: designReferenceModel,
      callOpenRouter: callBriefOpenRouter,
      parseJsonDraft,
      deferImagePromptPackage: true
    });
    const humanizedDraft = await humanizeCreativeTeamDraft({
      token,
      body: { ...bodyWithReferenceImages, attentionFrame: draft.attentionFrame },
      draft,
      model: writingModel,
      callOpenRouter: callBriefOpenRouter,
      parseJsonDraft
    });
    const finalDraft = await completeCreativeTeamImagePrompt({
      token,
      body: bodyWithReferenceImages,
      draft: humanizedDraft,
      model: writingModel,
      callOpenRouter: callBriefOpenRouter,
      parseJsonDraft
    });
    const textContractViolations = [
      ...getVisibleTextContractViolations({ contentScript: finalDraft.contentScript }),
      ...validateHeadlineSafety(finalDraft.contentScript?.headline)
    ];
    if (textContractViolations.length) {
      return sendJson(response, 422, {
        error: "Финальный текст инфографики не прошел проверку",
        code: "visible_text_contract",
        violations: textContractViolations
      });
    }
    return sendJson(response, 200, { model: writingModel, draft: finalDraft });
  } catch (error) {
    console.error("[openrouter:brief:error]", JSON.stringify({
      message: error.message || "OpenRouter request failed",
      name: error.name || ""
    }));
    return sendJson(response, 502, { error: error.message || "OpenRouter request failed" });
  }
}

async function attachDesignReferenceImageUrls(body, request) {
  const reference = body.activeDesignReference || body.reference || {};
  const rawUrls = [reference.imageUrl, reference.imageData].filter(Boolean).slice(0, 1);
  if (!rawUrls.length) return body;
  const designReferenceImageUrls = await resolveImageInputUrls(rawUrls, request);
  return designReferenceImageUrls.length ? { ...body, designReferenceImageUrls } : body;
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
    const draft = parseJsonDraft(content);
    const violations = validateHeadlineSafety(draft.headline);
    if (violations.length) return sendJson(response, 422, { error: "Заголовок не прошел AI-safe-zone проверку", code: "headline_safe_zone", violations });
    return sendJson(response, 200, { model: writingModel, draft });
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
    const draft = parseJsonDraft(content, { strict: false });
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
    "Сначала зафиксируй визуальный отпечаток продукта: форма упаковки, материал, цвет фона, основной цвет этикетки, акцентные цвета, крышка, читаемое название, крупные слова, расположение текста, заметные иконки и общий стиль дизайна.",
    "Если какая-то деталь не читается, так и напиши: не читается или не видно. Не достраивай бренд, объем, дозировку, состав или SKU по догадке.",
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
      "Перед финальным JSON вычитай русский текст: исправь очевидные OCR-ошибки, пропущенные буквы, опечатки, падежи и согласования.",
      "Не копируй в поля карточки искаженные слова из OCR вроде потерянной первой буквы; если слово не читается, напиши 'не читается' вместо догадки.",
      "Избегай медицинских, финансовых, юридических и косметологических гарантий.",
      "Для БАДов, wellness, витаминов и косметики не называй продукт лекарством, препаратом, лечением, терапией или медицинским средством.",
      "В promptComment фиксируй реальный внешний вид: форму упаковки, цвет, этикетку, читаемое название, крышку, коробку, объем, заметные слова и композицию дизайна. Не предлагай ребрендинг или новую упаковку.",
      "promptComment должен быть как жёсткий reference lock для генерации: что сохранить обязательно и что не менять в упаковке.",
      "Если фото не дает точного внешнего вида, прямо напиши в promptComment, что упаковку нельзя рисовать крупно и нельзя выдумывать этикетку."
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

export async function callOpenRouter(token, model, messages, options = {}) {
  const timeoutMs = options.timeoutMs || defaultOpenRouterTimeoutMs;
  const task = describeOpenRouterTask(messages);
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    console.log("[openrouter:call:start]", JSON.stringify({ model, task, timeoutMs }));
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
    const payload = await readOpenRouterPayload(result);
    if (!result.ok) throw new Error(getOpenRouterErrorMessage(payload, "OpenRouter request failed"));
    console.log("[openrouter:call:done]", JSON.stringify({ model, task, durationMs: Date.now() - startedAt }));
    return payload.choices?.[0]?.message?.content || "";
  } catch (error) {
    console.error("[openrouter:call:error]", JSON.stringify({
      model,
      task,
      durationMs: Date.now() - startedAt,
      message: error.name === "AbortError" ? `timeout after ${timeoutMs}ms` : error.message
    }));
    if (error.name === "AbortError") {
      throw new Error(`OpenRouter не ответил за ${Math.round(timeoutMs / 1000)} сек. Попробуйте меньше фото или повторите позже.`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function callBriefOpenRouter(token, model, messages, options = {}) {
  return callOpenRouter(token, model, messages, { ...options, timeoutMs: options.timeoutMs || briefOpenRouterTimeoutMs });
}

function describeOpenRouterTask(messages = []) {
  const user = messages.find((message) => message.role === "user") || {};
  const content = Array.isArray(user.content)
    ? user.content.find((item) => item?.type === "text")?.text
    : user.content;
  if (!content) return "unknown";
  try {
    const parsed = JSON.parse(content);
    return String(parsed.task || parsed.role || "json-task").slice(0, 120);
  } catch {
    return String(content).slice(0, 120);
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
