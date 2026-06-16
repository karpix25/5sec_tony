import { createContentSlot, createRecentJobDigest } from "../domain/content-rotation.js";
import { buildProductInsightMap } from "../domain/product-insights.js";

export async function generateAiBrief({ project, product, reference, existingJobs, diversitySlot }) {
  const slot = diversitySlot || createContentSlot({ project, product, existingJobs });
  const response = await fetch("/api/generation/brief", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      project,
      product,
      reference,
      existingJobs: createRecentJobDigest(existingJobs),
      diversitySlot: slot
    })
  });
  const payload = await readServicePayload(response);
  if (!response.ok) throw new Error(payload.error || "OpenRouter brief generation failed");
  return normalizeAiBrief(payload.draft || {}, slot);
}

function normalizeAiBrief(draft, diversitySlot) {
  const topic = diversitySlot.lockTopic
    ? diversitySlot.topic
    : draft.topic || diversitySlot.topic || "";
  return {
    topic,
    hook: draft.hook || diversitySlot.hook || "",
    format: draft.format || diversitySlot.format || "",
    pointCount: draft.pointCount || "",
    visualObject: draft.visualObject || diversitySlot.visualObject || "",
    cta: draft.cta || "",
    notes: "AI-сгенерированный бриф на основе проекта, продукта и истории тем.",
    aiPlan: draft.plan || {},
    productInsightMap: buildProductInsightMap({ insightMap: draft.productInsightMap }),
    semanticKey: diversitySlot.id || draft.semanticKey,
    contentLayer: diversitySlot.contentLayer || null,
    contentLayerId: diversitySlot.contentLayer?.id || "",
    diversitySlot
  };
}

async function readServicePayload(response) {
  if (typeof response.json === "function") {
    try { return await response.json(); } catch {}
  }
  const raw = typeof response.text === "function" ? await response.text().catch(() => "") : "";
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return { error: raw.trim() || "API вернул некорректный JSON." }; }
}
