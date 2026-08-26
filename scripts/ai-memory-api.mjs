import { normalizeDesignAnalysis, normalizeProductAiPassport } from "../src/domain/ai-artifacts.js";
import { createDesignReferenceAnalysisInput } from "../src/domain/design-reference-analysis-input.js";
import { createProductPassportInput } from "../src/domain/product-passport-input.js";
import { createCreativeTeamPayload } from "../src/domain/creative-team-payload.js";
import { createProductPassportShape, productWorldRules } from "../src/domain/product-world.js";
import { isEditorialTopicEligible } from "../src/domain/editorial-topic-policy.js";
import { getUnsupportedClaimViolations } from "../src/domain/content-claim-contract.js";
import { normalizeProductContentDirections } from "../src/domain/product-content-directions.js";
import { callOpenRouter } from "./openrouter-api.mjs";
import { parseJsonDraft } from "./openrouter-response.mjs";
import { resolveImageInputUrls } from "./reference-assets.mjs";
import { readJsonRequest } from "./request-body.mjs";

const writingModel = "google/gemini-3.1-flash-lite";

export async function handleAiMemoryApi(request, response, url) {
  if (request.method === "POST" && url.pathname === "/api/products/passport") {
    return createProductPassport(request, response);
  }
  if (request.method === "POST" && url.pathname === "/api/products/content-directions") {
    return createProductContentDirections(request, response);
  }
  if (request.method === "POST" && url.pathname === "/api/design-references/analyze") {
    return analyzeDesignReference(request, response);
  }
  return false;
}

async function createProductContentDirections(request, response) {
  try {
    const token = process.env.OPENROUTER_API_KEY;
    if (!token) return sendJson(response, 500, { error: "OPENROUTER_API_KEY is not configured" });
    const body = await readJson(request);
    const content = await callOpenRouter(token, writingModel, [
      { role: "system", content: "Ты senior audience strategist и редактор коротких соцсетей. Пиши по-русски. Верни только JSON без markdown." },
      { role: "user", content: productContentDirectionsInstruction(body) }
    ]);
    const parsed = parseJsonDraft(content);
    const source = parsed.contentDirections || parsed;
    const safeItems = (Array.isArray(source.items) ? source.items : []).filter((item) => isSafeContentDirection(item, body));
    const contentDirections = normalizeProductContentDirections({ ...source, items: safeItems });
    if (!contentDirections || contentDirections.items.length < 4) {
      throw new Error("AI не создал достаточно релевантных направлений для продукта");
    }
    return sendJson(response, 200, { contentDirections });
  } catch (error) {
    return sendJson(response, 502, { error: error.message || "Не удалось рассчитать направления продукта" });
  }
}

async function createProductPassport(request, response) {
  try {
    const token = process.env.OPENROUTER_API_KEY;
    if (!token) return sendJson(response, 500, { error: "OPENROUTER_API_KEY is not configured" });
    const body = await readJson(request);
    const content = await callOpenRouter(token, writingModel, [
      { role: "system", content: "Ты senior product strategist. Пиши по-русски. Верни только JSON без markdown." },
      { role: "user", content: productPassportInstruction(body) }
    ]);
    return sendJson(response, 200, { passport: normalizeProductAiPassport(parseJsonDraft(content).productPassport || parseJsonDraft(content)) });
  } catch (error) {
    return sendJson(response, 502, { error: error.message || "Не удалось обновить AI-паспорт продукта" });
  }
}

async function analyzeDesignReference(request, response) {
  try {
    const token = process.env.OPENROUTER_API_KEY;
    if (!token) return sendJson(response, 500, { error: "OPENROUTER_API_KEY is not configured" });
    const body = await readJson(request);
    const urls = await resolveImageInputUrls([body.reference?.imageData || body.reference?.imageUrl].filter(Boolean), request);
    const userContent = urls.length
      ? [{ type: "text", text: designAnalysisInstruction(body) }, { type: "image_url", image_url: { url: urls[0] } }]
      : designAnalysisInstruction(body);
    const content = await callOpenRouter(token, writingModel, [
      { role: "system", content: "Ты senior visual designer и art director. Пиши по-русски. Верни только JSON без markdown." },
      { role: "user", content: userContent }
    ]);
    const parsed = parseJsonDraft(content);
    const designAnalysis = normalizeDesignAnalysis(parsed.designAnalysis || parsed.designFormatBrief || parsed);
    return sendJson(response, 200, { designAnalysis });
  } catch (error) {
    return sendJson(response, 502, { error: error.message || "Не удалось проанализировать дизайн-референс" });
  }
}

export function productPassportInstruction(body) {
  const input = createProductPassportInput(body);
  return JSON.stringify({
    task: "Создай durable AI-паспорт продукта для будущих генераций.",
    rules: [
      "Не анализируй визуал и не создавай visualIdentity.",
      "Фокус: что это, кому нужно, use cases, боли, желания, возражения, safe facts, allowed claims, forbidden claims.",
      "Не выдумывай состав, цифры, гарантии, лечение, финансовый или юридический результат.",
      "Поля должны быть полезны для множества будущих тем, а не для одной картинки.",
      ...productWorldRules
    ],
    output: {
      productPassport: createProductPassportShape()
    },
    product: input.product
  });
}

function productContentDirectionsInstruction(body) {
  const compact = createCreativeTeamPayload({ project: body.project, product: body.product });
  return JSON.stringify({
    task: "Создай 5–6 направлений контента для одного продукта.",
    role: "Ты редактор смыслов для коротких постов и каруселей.",
    output: {
      contentDirections: {
        items: [
          { id: "короткий-id", title: "Короткое название направления", relation: "Почему оно связано с задачей продукта.", kind: "adjacent" }
        ]
      }
    },
    rules: [
      "Направление — это смысловая территория, а не готовый заголовок и не конкретный пост.",
      "Название должно быть коротким, понятным и без метафор.",
      "Каждое направление должно естественно вытекать из продукта, его аудитории и жизненной ситуации.",
      "Используй смежные темы: привычки, ошибки, выбор, режим, бытовые ситуации, простые советы и проверяемые факты.",
      "Не добавляй случайные темы, которые не помогают решить основную задачу продукта.",
      "Не придумывай медицинские, финансовые или юридические обещания, причины, эффекты, цифры и свойства.",
      "Не добавляй название бренда, CTA или призыв к покупке.",
      "Не создавай направление «сам продукт»: оно добавляется системой отдельно.",
      ...productWorldRules
    ],
    project: compact.project,
    product: compact.product
  });
}

function isSafeContentDirection(item, body) {
  const text = [item?.title || item?.label, item?.relation || item?.description].filter(Boolean).join(". ");
  return Boolean(text)
    && isEditorialTopicEligible({ text, project: body.project, product: body.product })
    && !getUnsupportedClaimViolations({ headline: text }, {
      project: body.project,
      product: body.product,
      productPassport: body.product?.aiPassport
    }).length;
}

export { createProductPassportInput };

function designAnalysisInstruction(body) {
  const input = createDesignReferenceAnalysisInput(body);
  return JSON.stringify({
    task: "Проанализируй дизайн-референс один раз как reusable visual grammar для будущих постов.",
    rules: [
      "Мыслями как дизайнер: структура, композиция, типографика, фон, элементы, плотность текста, safe zones, ритм.",
      "CTA, кнопки, футер и чужие призывы из референса не копировать и пометить как запрещенный carryover.",
      "Не копировать чужой продукт, логотипы, человека, текст, claims.",
      "Описание должно помогать адаптировать новые темы под этот дизайн, а не повторять картинку буквально.",
      "Оцени edge pressure: важные элементы у верхнего края, нижних 30%, левого края и правого rail Instagram.",
      "Заполни safeZoneAdaptation: как сохранить visual grammar, но перенести важный контент внутрь x=150..830, y=360..1300; нижние 30% оставлять декоративным фоном."
    ],
    output: {
      designAnalysis: {
        formatType: "ranking_leaderboard|comparison_grid|checklist_cards|timeline|symptom_poster|single_thesis|other",
        structureName: "",
        layoutSlots: [],
        textContract: { headlineShape: "", subheadShape: "", itemShape: "", minItems: 0, maxItems: 0, preferredItems: 0, avoidTextTypes: [], forbiddenCarryoverText: [] },
        visualGrammar: { composition: "", background: "", palette: "", typography: "", framesAndDividers: "", imageTreatment: "", hierarchy: "" },
        safeZoneAdaptation: { edgePressure: "", topRisk: "", bottomRisk: "", rightRailRisk: "", leftRisk: "", remapPlan: [], decorativeOnlyZones: [] },
        elements: [],
        adaptationRules: [],
        doNotCopy: [],
        ctaPolicy: "ignore-reference-cta"
      }
    },
    reference: input.reference
  });
}

function readJson(request) {
  return readJsonRequest(request);
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
  return true;
}
