export async function generateAudienceExpertDraft({ project, draft, products }) {
  const response = await fetch("/api/project/audience-expert", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project, draft, products })
  });
  const payload = await response.json();
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
    companyAudience: audienceClean(draft.companyAudience),
    toneOfVoice: audienceClean(draft.toneOfVoice),
    restrictions: audienceLines(draft.restrictions)
  };
}

function audienceLines(value) {
  if (Array.isArray(value)) return value.map(audienceClean).filter(Boolean).join("\n");
  return audienceClean(value);
}

function audienceClean(value) {
  return String(value || "").trim();
}
