import { extractJsonCandidate, parsePossiblyRepairedJson } from "./json-draft-repair.mjs";

const jsonDraftFormatErrorCode = "json_draft_format";

export function parseJsonDraft(text, options = {}) {
  const json = extractJsonCandidate(text);
  if (!json) {
    if (options.strict === false) return {};
    throw createJsonDraftFormatError("OpenRouter не вернул JSON-черновик.");
  }
  try {
    return parsePossiblyRepairedJson(json);
  } catch (error) {
    if (options.strict === false) return {};
    throw createJsonDraftFormatError("AI-команда вернула черновик в неправильном формате. Запустите генерацию еще раз.");
  }
}

export async function readOpenRouterPayload(response) {
  const raw = await response.text().catch(() => "");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { error: { message: raw.trim() || "OpenRouter вернул некорректный JSON." } };
  }
}

export function getOpenRouterErrorMessage(payload, fallback) {
  return payload.error?.message || payload.error || fallback;
}

export function isJsonDraftFormatError(error) {
  return error?.code === jsonDraftFormatErrorCode
    || /JSON-черновик|черновик в неправильном формате/i.test(String(error?.message || ""));
}

function createJsonDraftFormatError(message) {
  const error = new Error(message);
  error.code = jsonDraftFormatErrorCode;
  return error;
}
