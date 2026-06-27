export function extractJsonCandidate(text) {
  return String(text).match(/\{[\s\S]*\}/)?.[0] || "";
}

export function parsePossiblyRepairedJson(json) {
  try {
    return JSON.parse(json);
  } catch (originalError) {
    const repaired = repairJsonDraft(json);
    if (repaired === json) throw originalError;
    try {
      return JSON.parse(repaired);
    } catch {
      throw originalError;
    }
  }
}

function repairJsonDraft(json) {
  return String(json)
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/([}\]])\s*(?=[{\[])/g, "$1,")
    .replace(/([}\]])\s*(?="[^"]+"\s*:)/g, "$1,")
    .replace(/("[^"\\]*(?:\\.[^"\\]*)*")\s*(?="[^"]+"\s*:)/g, "$1,")
    .replace(/("[^"\\]*(?:\\.[^"\\]*)*")\s*(?=[{\[])/g, "$1,")
    .replace(/("[^"\\]*(?:\\.[^"\\]*)*")\s*(?=")/g, "$1,");
}
