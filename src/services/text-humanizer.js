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
  const payload = await readHumanizerPayload(response);
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

async function readHumanizerPayload(response) {
  if (typeof response.json === "function") {
    try { return await response.json(); } catch {}
  }
  const raw = typeof response.text === "function" ? await response.text().catch(() => "") : "";
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return { error: raw.trim() || "API вернул некорректный JSON." }; }
}
