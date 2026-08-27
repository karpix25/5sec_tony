import { createContentSlot, createGenerationHistory, createRecentJobDigest } from "../src/domain/content-rotation.js";
import { createLayoutContentPlan } from "../src/domain/layout-content-planner.js";
import { createCreativeTeamPayload } from "../src/domain/creative-team-payload.js";
import { createAvatarReservedZone } from "../src/domain/avatar-overlay-zone.js";
import { createAvatarEmotionPromptContext } from "../src/domain/avatar-emotion.js";
import { createProductVisibilityDecision } from "../src/domain/product-visibility-decision.js";
import {
  assessAiBriefFreshness,
  createFreshnessFallbackBrief,
  createRejectedBriefJob
} from "../src/domain/ai-brief-freshness.js";
import { normalizeAiBrief } from "../src/domain/ai-brief-normalizer.js";

const maxBriefAttempts = 3;

export async function generateServerAiBrief({ origin, project, product, reference, character, existingJobs, diversitySlot, contentDirectionIds = [] }) {
  const avatarSafeZone = createAvatarReservedZone({ character, ctaOverlay: project?.ctaOverlay });
  const generationHistory = createGenerationHistory(existingJobs, { product });
  const rejectedJobs = [];
  let fallbackBrief = null;
  for (let attempt = 0; attempt < maxBriefAttempts; attempt += 1) {
    const attemptExistingJobs = [...generationHistory, ...rejectedJobs];
    const slot = diversitySlot || createContentSlot({ project, product, existingJobs: attemptExistingJobs, contentDirectionIds });
    const productVisibilityDecision = createProductVisibilityDecision({ project, product, existingJobs: attemptExistingJobs, contentDirection: slot.contentDirection });
    const brief = await requestServerAiBrief(origin, {
      project,
      product,
      reference,
      productVisibilityDecision,
      avatarSafeZone,
      existingJobs: attemptExistingJobs,
      slot,
      contentDirection: slot.contentDirection || null
    });
    const freshness = slot.lockTopic ? { ok: true, reasons: [] } : assessAiBriefFreshness(brief, attemptExistingJobs);
    if (freshness.ok) return brief;
    fallbackBrief = brief;
    rejectedJobs.push(createRejectedBriefJob(brief, freshness));
  }
  if (fallbackBrief) return createFreshnessFallbackBrief(fallbackBrief, rejectedJobs);
  throw new Error("AI-бриф не подготовился");
}

async function requestServerAiBrief(origin, { project, product, reference, productVisibilityDecision, avatarSafeZone, existingJobs, slot, contentDirection }) {
  const payload = await postJson(origin, "/api/generation/brief", createCreativeTeamPayload({
    project,
    product,
    reference,
    activeDesignReference: createDesignReferenceDigest(reference),
    layoutContentPlan: createLayoutContentPlan(reference),
    productPassport: product?.aiPassport || null,
    designAnalysis: reference?.designAnalysis || null,
    productVisibilityDecision,
    avatarSafeZone,
    availableAvatarEmotions: createAvatarEmotionPromptContext(project),
    existingJobs: createRecentJobDigest(existingJobs, { product }),
    diversitySlot: slot,
    contentDirection
  }));
  return normalizeAiBrief(payload.draft || {}, slot);
}

function createDesignReferenceDigest(reference = {}) {
  return {
    id: reference.id || "",
    title: reference.title || "",
    layoutType: reference.layoutType || "",
    visualObject: reference.visualObject || "",
    promptComment: reference.promptComment || "",
    takeaways: reference.takeaways || "",
    avoidCopy: reference.avoidCopy || "",
    textDensity: reference.textDensity || "",
    headlineStyle: reference.headlineStyle || "",
    fontStyle: reference.fontStyle || "",
    designAnalysis: reference.designAnalysis || null,
    imageName: reference.imageName || "",
    palette: reference.palette || "",
    imageUrl: reference.imageUrl || reference.imageData || "",
    imageData: reference.imageData || reference.imageUrl || ""
  };
}

async function postJson(origin, path, body) {
  const response = await fetch(`${origin}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Generation brief API failed: ${response.status}`);
  return payload;
}
