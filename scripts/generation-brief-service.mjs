import { createContentSlot, createRecentJobDigest } from "../src/domain/content-rotation.js";
import { createLayoutContentPlan } from "../src/domain/layout-content-planner.js";
import { normalizeHookLibrary, selectHookReference } from "../src/domain/hook-library.js";
import { createCreativeTeamPayload } from "../src/domain/creative-team-payload.js";
import { createAvatarReservedZone } from "../src/domain/avatar-overlay-zone.js";
import { createAvatarEmotionPromptContext } from "../src/domain/avatar-emotion.js";
import { createProductVisibilityDecision } from "../src/domain/product-visibility-decision.js";
import { createTopicClusterPlan } from "../src/domain/topic-clusters.js";
import {
  assessAiBriefFreshness,
  createFreshnessFallbackBrief,
  createRejectedBriefJob
} from "../src/domain/ai-brief-freshness.js";
import { normalizeAiBrief } from "../src/domain/ai-brief-normalizer.js";

const maxBriefAttempts = 3;

export async function generateServerAiBrief({ origin, project, product, reference, character, existingJobs, diversitySlot, hookLibrary }) {
  const hookSeed = selectHookReference({ hookLibrary, project, product, existingJobs });
  const hookDigest = createHookLibraryDigest(hookLibrary, hookSeed);
  const avatarSafeZone = createAvatarReservedZone({ character, ctaOverlay: project?.ctaOverlay });
  const rejectedJobs = [];
  let fallbackBrief = null;
  for (let attempt = 0; attempt < maxBriefAttempts; attempt += 1) {
    const attemptExistingJobs = [...(existingJobs || []), ...rejectedJobs];
    const slot = diversitySlot || createContentSlot({ project, product, existingJobs: attemptExistingJobs });
    const productVisibilityDecision = createProductVisibilityDecision({ project, product, existingJobs: attemptExistingJobs });
    const topicClusterPlan = createTopicClusterPlan({ product, existingJobs: attemptExistingJobs });
    const brief = await requestServerAiBrief(origin, {
      project,
      product,
      reference,
      hookDigest,
      hookSeed,
      productVisibilityDecision,
      topicClusterPlan,
      avatarSafeZone,
      existingJobs: attemptExistingJobs,
      slot
    });
    const freshness = slot.lockTopic ? { ok: true, reasons: [] } : assessAiBriefFreshness(brief, attemptExistingJobs);
    if (freshness.ok) return brief;
    fallbackBrief = brief;
    rejectedJobs.push(createRejectedBriefJob(brief, freshness));
  }
  if (fallbackBrief) return createFreshnessFallbackBrief(fallbackBrief, rejectedJobs);
  throw new Error("AI-бриф не подготовился");
}

async function requestServerAiBrief(origin, { project, product, reference, hookDigest, hookSeed, productVisibilityDecision, topicClusterPlan, avatarSafeZone, existingJobs, slot }) {
  const payload = await postJson(origin, "/api/generation/brief", createCreativeTeamPayload({
    project,
    product,
    reference,
    activeDesignReference: createDesignReferenceDigest(reference),
    layoutContentPlan: createLayoutContentPlan(reference),
    hookLibrary: hookDigest,
    hookSeed,
    productPassport: product?.aiPassport || null,
    designAnalysis: reference?.designAnalysis || null,
    productVisibilityDecision,
    topicClusterPlan,
    topicCluster: topicClusterPlan.selected,
    avatarSafeZone,
    availableAvatarEmotions: createAvatarEmotionPromptContext(project),
    existingJobs: createRecentJobDigest(existingJobs),
    diversitySlot: slot
  }));
  return normalizeAiBrief(payload.draft || {}, slot);
}

function createHookLibraryDigest(hookLibrary, hookSeed = null) {
  const library = normalizeHookLibrary(hookLibrary);
  const active = library.versions.find((version) => version.id === library.activeVersionId)
    || library.versions.find((version) => version.status === "active")
    || library.versions[0];
  return {
    activeVersionId: active?.id || "",
    title: active?.title || "",
    seedHook: hookSeed || null,
    hooks: (active?.hooks || [])
      .filter((hook) => hook.enabled !== false && hook.text)
      .slice(0, 80)
      .map((hook) => ({
        id: hook.id || "",
        text: hook.text,
        tags: hook.tags || [],
        aggression: hook.aggression || ""
      }))
  };
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
