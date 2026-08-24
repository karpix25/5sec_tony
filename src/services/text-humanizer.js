export async function humanizeGenerationPlan({ project, product, brief, plan }) {
  const response = await fetch("/api/generation/humanize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      project,
      product,
      brief,
      plan
    })
  });
  const payload = await readHumanizerPayload(response);
  if (!response.ok) throw new Error(payload.error || "OpenRouter text humanizer failed");
  return normalizeServiceHumanizedPlan(payload.draft || {}, plan, { lockedHeadline: brief?.hook || plan.headline });
}

function normalizeServiceHumanizedPlan(draft, fallbackPlan) {
  const points = Array.isArray(draft.points) ? draft.points.map(cleanServiceHumanizerLine).filter(Boolean) : [];
  return {
    headline: cleanServiceHumanizerLine(draft.headline) || fallbackPlan.headline || "",
    subhead: cleanServiceHumanizerLine(draft.subhead) || fallbackPlan.subhead || "",
    points: points.length ? points : fallbackPlan.points || [],
    cta: cleanServiceHumanizerLine(draft.cta) || fallbackPlan.cta || "",
    disclaimer: cleanServiceHumanizerLine(draft.disclaimer) || fallbackPlan.disclaimer || ""
  };
}

function cleanServiceHumanizerLine(value) {
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
