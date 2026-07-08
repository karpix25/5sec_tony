import { stripUnicodeReplacementCharacters } from "../domain/text-integrity.js";

export async function generateAudienceExpertDraft({ project, draft, products }) {
  const response = await fetch("/api/project/audience-expert", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project, draft, products })
  });
  const payload = await readAudiencePayload(response);
  if (!response.ok) throw new Error(payload.error || "OpenRouter audience expert failed");
  return normalizeAudienceDraft(payload.draft || {});
}

function normalizeAudienceDraft(draft) {
  return {
    niche: audienceClean(draft.niche),
    keyScenarios: audienceLines(draft.keyScenarios),
    audiencePains: audienceLines(draft.audiencePains),
    audienceDesires: audienceLines(draft.audienceDesires),
    audienceObjections: audienceLines(draft.audienceObjections),
    allowedTriggers: audienceLines(draft.allowedTriggers),
    forbiddenTriggers: audienceLines(draft.forbiddenTriggers),
    hookAggression: audienceClean(draft.hookAggression),
    contentRestrictions: audienceLines(draft.contentRestrictions),
    companyAudience: audienceLines(draft.companyAudience),
    toneOfVoice: audienceClean(draft.toneOfVoice),
    restrictions: audienceLines(draft.restrictions)
  };
}

function audienceLines(value) {
  if (Array.isArray(value)) return value.map(audienceClean).filter(Boolean).join("\n");
  return audienceClean(value);
}

function audienceClean(value) {
  if (value == null) return "";
  if (typeof value === "string") {
    return stripUnicodeReplacementCharacters(value).trim();
  }
  if (Array.isArray(value)) return value.map(audienceClean).filter(Boolean).join("\n");
  if (typeof value === "object") return Object.values(value).map(audienceClean).filter(Boolean).join(" — ");
  return stripUnicodeReplacementCharacters(value || "").trim();
}

async function readAudiencePayload(response) {
  if (typeof response.json === "function") {
    try { return await response.json(); } catch {}
  }
  const raw = typeof response.text === "function" ? await response.text().catch(() => "") : "";
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return { error: raw.trim() || "API вернул некорректный JSON." }; }
}
