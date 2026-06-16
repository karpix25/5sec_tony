export function parseJsonDraft(text, options = {}) {
  const json = String(text).match(/\{[\s\S]*\}/)?.[0] || "";
  if (!json) {
    if (options.strict === false) return {};
    throw new Error("OpenRouter не вернул JSON-черновик.");
  }
  try {
    return JSON.parse(json);
  } catch (error) {
    if (options.strict === false) return {};
    throw new Error(`OpenRouter вернул невалидный JSON: ${error.message}`);
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
