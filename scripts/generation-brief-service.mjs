import { createContentSlot, createRecentJobDigest } from "../src/domain/content-rotation.js";
import { createLayoutContentPlan } from "../src/domain/layout-content-planner.js";
import { normalizeHookLibrary } from "../src/domain/hook-library.js";
import { createCreativeTeamPayload } from "../src/domain/creative-team-payload.js";
import {
  assessAiBriefFreshness,
  createFreshnessFallbackBrief,
  createRejectedBriefJob
} from "../src/domain/ai-brief-freshness.js";
import { normalizeAiBrief } from "../src/domain/ai-brief-normalizer.js";

const maxBriefAttempts = 3;

export async function generateServerAiBrief({ origin, project, product, reference, existingJobs, diversitySlot, hookLibrary }) {
  const hookDigest = createHookLibraryDigest(hookLibrary);
  const rejectedJobs = [];
  let fallbackBrief = null;
  for (let attempt = 0; attempt < maxBriefAttempts; attempt += 1) {
    const attemptExistingJobs = [...(existingJobs || []), ...rejectedJobs];
    const slot = diversitySlot || createContentSlot({ project, product, existingJobs: attemptExistingJobs });
    const brief = await requestServerAiBrief(origin, {
      project,
      product,
      reference,
      hookDigest,
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

async function requestServerAiBrief(origin, { project, product, reference, hookDigest, existingJobs, slot }) {
  const payload = await postJson(origin, "/api/generation/brief", createCreativeTeamPayload({
    project,
    product,
    reference,
    activeDesignReference: createDesignReferenceDigest(reference),
    layoutContentPlan: createLayoutContentPlan(reference),
    hookLibrary: hookDigest,
    existingJobs: createRecentJobDigest(existingJobs),
    diversitySlot: slot
  }));
  return normalizeAiBrief(payload.draft || {}, slot);
}

function createHookLibraryDigest(hookLibrary) {
  const library = normalizeHookLibrary(hookLibrary);
  const active = library.versions.find((version) => version.id === library.activeVersionId)
    || library.versions.find((version) => version.status === "active")
    || library.versions[0];
  return {
    activeVersionId: active?.id || "",
    title: active?.title || "",
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
