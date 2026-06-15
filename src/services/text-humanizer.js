export async function humanizeGenerationPlan({ project, product, brief, plan }) {
  const response = await fetch("/api/generation/humanize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      project,
      product,
      brief,
      plan,
      hookReference: brief.hookReference || null
    })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "OpenRouter text humanizer failed");
  return normalizeHumanizedPlan(payload.draft || {}, plan);
}

function normalizeHumanizedPlan(draft, fallbackPlan) {
  const points = Array.isArray(draft.points) ? draft.points.map(cleanLine).filter(Boolean) : [];
  return {
    headline: cleanLine(draft.headline) || fallbackPlan.headline || "",
    subhead: cleanLine(draft.subhead) || fallbackPlan.subhead || "",
    points: points.length ? points : fallbackPlan.points || [],
    cta: cleanLine(draft.cta) || fallbackPlan.cta || "",
    disclaimer: cleanLine(draft.disclaimer) || fallbackPlan.disclaimer || ""
  };
}

function cleanLine(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}
