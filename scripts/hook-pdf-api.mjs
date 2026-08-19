import { extractPdfText } from "./pdf-text.mjs";

const openRouterUrl = "https://openrouter.ai/api/v1/chat/completions";
const pdfModel = "google/gemini-3.1-flash-lite";

export async function handleHookPdfApi(request, response, url) {
  if (request.method !== "POST" || url.pathname !== "/api/hooks/extract-pdf") return false;
  try {
    const body = await readJson(request);
    const bytes = readPdfData(body.pdfData);
    if (!bytes.length) return sendJson(response, 400, { error: "Нужно загрузить PDF с хуками" });
    const text = extractPdfText(bytes) || await extractPdfTextWithAi(body);
    if (!text) return sendJson(response, 422, { error: "Не удалось найти хуки в PDF. Попробуйте PDF с выделяемым текстом или загрузите скрин." });
    return sendJson(response, 200, { text });
  } catch (error) {
    return sendJson(response, 500, { error: error.message || "Не удалось прочитать PDF" });
  }
}

async function extractPdfTextWithAi(body) {
  const token = process.env.OPENROUTER_API_KEY;
  if (!token) return "";
  const content = await callOpenRouter(token, [
    {
      role: "user",
      content: [
        { type: "text", text: hookPdfInstruction(body) },
        { type: "file", file: { filename: body.fileName || "hooks.pdf", file_data: body.pdfData } }
      ]
    }
  ]);
  const draft = parseJsonDraft(content);
  return Array.isArray(draft.hooks) ? draft.hooks.join("\n") : "";
}

async function callOpenRouter(token, messages) {
  const result = await fetch(openRouterUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://127.0.0.1:4173",
      "X-Title": "Anton 5 sec Studio"
    },
    body: JSON.stringify({
      model: pdfModel,
      messages,
      plugins: [{ id: "file-parser", pdf: { engine: "mistral-ocr" } }],
      temperature: 0.1
    })
  });
  const payload = await result.json().catch(() => ({}));
  if (!result.ok) throw new Error(payload.error?.message || "OpenRouter PDF request failed");
  return payload.choices?.[0]?.message?.content || "";
}

function hookPdfInstruction(body) {
  return JSON.stringify({
    task: "Прочитай PDF и извлеки только подводки, хуки, заголовки и короткие формулы начала коротких видео.",
    title: body.title || "",
    rules: [
      "Верни только JSON без markdown.",
      "Один элемент массива = один самостоятельный хук.",
      "Не включай номера страниц, колонтитулы, служебные подписи, даты и длинные объяснения.",
      "Сохраняй русский текст как в PDF, исправляя только явные OCR-ошибки.",
      "Если хук или формула в PDF написаны по-английски, переведи смысл на русский."
    ],
    output: { hooks: ["короткий хук"] }
  });
}

function parseJsonDraft(text) {
  const json = String(text).match(/\{[\s\S]*\}/)?.[0] || "{}";
  try {
    return JSON.parse(json);
  } catch {
    return { hooks: parseHookLines(text) };
  }
}

function parseHookLines(text) {
  return String(text || "")
    .split(/\n|•|— |\d+[.)]/)
    .map((line) => line.replace(/^[-–—*"'«»\s]+|["'«»\s]+$/g, "").trim())
    .filter((line) => line.length >= 8)
    .slice(0, 200);
}

function readPdfData(value = "") {
  const source = String(value);
  const base64 = source.includes(",") ? source.split(",").pop() : source;
  return Buffer.from(base64 || "", "base64");
}

function readJson(request) {
  return readJsonRequest(request, { limitBytes: 25 * 1024 * 1024, tooLargeMessage: "PDF слишком большой" });
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
  return true;
}
import { readJsonRequest } from "./request-body.mjs";
