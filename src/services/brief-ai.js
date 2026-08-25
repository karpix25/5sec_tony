import { createContentSlot, createRecentJobDigest } from "../domain/content-rotation.js";
import { createLayoutContentPlan } from "../domain/layout-content-planner.js";
import { createAvatarEmotionPromptContext } from "../domain/avatar-emotion.js";
import { createCreativeTeamPayload } from "../domain/creative-team-payload.js";
import {
  assessAiBriefFreshness,
  createFreshnessFallbackBrief,
  createRejectedBriefJob
} from "../domain/ai-brief-freshness.js";
import { normalizeAiBrief } from "../domain/ai-brief-normalizer.js";
import { uploadReferenceAsset } from "./reference-assets.js";

const briefAiDataImagePattern = /^data:image\/(?:png|jpe?g|webp);base64,/i;
const maxBriefAiAttempts = 3;

export async function generateAiBrief({ project, product, reference, existingJobs, diversitySlot }) {
  const preparedReference = await ensureReferenceAssetUrl(reference);
  const activeDesignReference = createDesignReferenceDigest(preparedReference);
  const rejectedJobs = [];
  let fallbackBrief = null;

  for (let attempt = 0; attempt < maxBriefAiAttempts; attempt += 1) {
    const attemptExistingJobs = [...(existingJobs || []), ...rejectedJobs];
    const slot = diversitySlot || createContentSlot({ project, product, existingJobs: attemptExistingJobs });
    const brief = await requestAiBrief({
      project,
      product,
      preparedReference,
      activeDesignReference,
      existingJobs: attemptExistingJobs,
      slot
    });
    const freshness = diversitySlot?.lockTopic
      ? { ok: true, reasons: [] }
      : assessAiBriefFreshness(brief, attemptExistingJobs);
    if (freshness.ok) return brief;
    fallbackBrief = brief;
    rejectedJobs.push(createRejectedBriefJob(brief, freshness));
  }

  if (fallbackBrief) return createFreshnessFallbackBrief(fallbackBrief, rejectedJobs);
  throw new Error("AI-бриф не подготовился");
}

async function requestAiBrief({ project, product, preparedReference, activeDesignReference, existingJobs, slot }) {
  const response = await fetch("/api/generation/brief", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(createCreativeTeamPayload({
      project,
      product,
      reference: preparedReference,
      activeDesignReference,
      layoutContentPlan: createLayoutContentPlan(preparedReference),
      existingJobs: createRecentJobDigest(existingJobs),
      availableAvatarEmotions: createAvatarEmotionPromptContext(project),
      diversitySlot: slot
    }))
  });
  const payload = await readServicePayload(response);
  if (!response.ok) throw new Error(payload.error || "OpenRouter brief generation failed");
  return normalizeAiBrief(payload.draft || {}, slot);
}

async function ensureReferenceAssetUrl(reference = {}) {
  if (!briefAiDataImagePattern.test(String(reference.imageData || ""))) return reference;
  const uploaded = await uploadReferenceAsset({ imageData: reference.imageData, imageName: reference.imageName || reference.title || "design-reference" });
  return { ...reference, imageData: uploaded.url, imageUrl: uploaded.url };
}

function createDesignReferenceDigest(reference) {
  return {
    id: reference?.id || "",
    title: reference?.title || "",
    layoutType: reference?.layoutType || "",
    visualObject: reference?.visualObject || "",
    promptComment: reference?.promptComment || "",
    takeaways: reference?.takeaways || "",
    avoidCopy: reference?.avoidCopy || "",
    textDensity: reference?.textDensity || "",
    headlineStyle: reference?.headlineStyle || "",
    fontStyle: reference?.fontStyle || "",
    imageName: reference?.imageName || "",
    palette: reference?.palette || "",
    imageUrl: reference?.imageUrl || reference?.imageData || "",
    imageData: reference?.imageData || reference?.imageUrl || ""
  };
}

async function readServicePayload(response) {
  const raw = typeof response.text === "function" ? await response.text().catch(() => "") : "";
  if (!raw && typeof response.json === "function") {
    try { return await response.json(); } catch {}
  }
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return { error: raw.trim() || "API вернул некорректный JSON." }; }
}
