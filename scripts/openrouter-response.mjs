import { extractJsonCandidate, parsePossiblyRepairedJson } from "./json-draft-repair.mjs";

export function parseJsonDraft(text, options = {}) {
  const json = extractJsonCandidate(text);
  if (!json) {
    if (options.strict === false) return {};
    throw new Error("OpenRouter не вернул JSON-черновик.");
  }
  try {
    return parsePossiblyRepairedJson(json);
  } catch (error) {
    if (options.strict === false) return {};
    throw new Error("AI-команда вернула черновик в неправильном формате. Запустите генерацию еще раз.");
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
