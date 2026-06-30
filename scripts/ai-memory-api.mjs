import { normalizeDesignAnalysis, normalizeProductAiPassport } from "../src/domain/ai-artifacts.js";
import { createProductPassportInput } from "../src/domain/product-passport-input.js";
import { callOpenRouter } from "./openrouter-api.mjs";
import { parseJsonDraft } from "./openrouter-response.mjs";
import { resolveImageInputUrls } from "./reference-assets.mjs";

const writingModel = "google/gemini-3.1-flash-lite";

export async function handleAiMemoryApi(request, response, url) {
  if (request.method === "POST" && url.pathname === "/api/products/passport") {
    return createProductPassport(request, response);
  }
  if (request.method === "POST" && url.pathname === "/api/design-references/analyze") {
    return analyzeDesignReference(request, response);
  }
  return false;
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
      "Поля должны быть полезны для множества будущих тем, а не для одной картинки."
    ],
    output: {
      productPassport: {
        productName: "",
        category: "",
        plainDescription: "",
        audience: [],
        coreUseCases: [],
        painSituations: [],
        desires: [],
        objections: [],
        safeFacts: [],
        allowedClaims: [],
        forbiddenClaims: [],
        contentTerritory: { directProductTopics: [], adjacentHelpfulTopics: [], unsafeTopics: [] },
        productVisibilityRules: { showProductWhen: [], avoidProductWhen: [] },
        tone: "",
        openQuestions: []
      }
    },
    product: input.product
  });
}

export { createProductPassportInput };

function designAnalysisInstruction(body) {
  return JSON.stringify({
    task: "Проанализируй дизайн-референс один раз как reusable visual grammar для будущих постов.",
    rules: [
      "Мыслями как дизайнер: структура, композиция, типографика, фон, элементы, плотность текста, safe zones, ритм.",
      "CTA, кнопки, футер и чужие призывы из референса не копировать и пометить как запрещенный carryover.",
      "Не копировать чужой продукт, логотипы, человека, текст, claims.",
      "Описание должно помогать адаптировать новые темы под этот дизайн, а не повторять картинку буквально."
    ],
    output: {
      designAnalysis: {
        formatType: "ranking_leaderboard|comparison_grid|checklist_cards|timeline|symptom_poster|single_thesis|other",
        structureName: "",
        layoutSlots: [],
        textContract: { headlineShape: "", subheadShape: "", itemShape: "", minItems: 0, maxItems: 0, preferredItems: 0, avoidTextTypes: [], forbiddenCarryoverText: [] },
        visualGrammar: { composition: "", background: "", palette: "", typography: "", framesAndDividers: "", imageTreatment: "", hierarchy: "" },
        elements: [],
        adaptationRules: [],
        doNotCopy: [],
        ctaPolicy: "ignore-reference-cta"
      }
    },
    reference: body.reference,
    project: body.project
  });
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let data = "";
    request.on("data", (chunk) => { data += chunk; });
    request.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch (error) { reject(error); }
    });
  });
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
  return true;
}
