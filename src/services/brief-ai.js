import { createContentSlot, createRecentJobDigest } from "../domain/content-rotation.js";

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
  const payload = await response.json();
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
    semanticKey: diversitySlot.id || draft.semanticKey,
    contentLayer: diversitySlot.contentLayer || null,
    contentLayerId: diversitySlot.contentLayer?.id || "",
    diversitySlot
  };
}
