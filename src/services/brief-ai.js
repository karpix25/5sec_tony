import { createContentSlot, createRecentJobDigest } from "../domain/content-rotation.js";
import { createLayoutContentPlan } from "../domain/layout-content-planner.js";
import { buildProductInsightMap } from "../domain/product-insights.js";
import { normalizeHookLibrary } from "../domain/hook-library.js";
import { createCreativeTeamPayload } from "../domain/creative-team-payload.js";
import { assessAiBriefFreshness, createRejectedBriefJob } from "../domain/ai-brief-freshness.js";
import { uploadReferenceAsset } from "./reference-assets.js";

const briefAiDataImagePattern = /^data:image\/(?:png|jpe?g|webp);base64,/i;
const maxBriefAiAttempts = 3;

export async function generateAiBrief({ project, product, reference, existingJobs, diversitySlot, hookLibrary }) {
  const hookDigest = createHookLibraryDigest(hookLibrary);
  const preparedReference = await ensureReferenceAssetUrl(reference);
  const activeDesignReference = createDesignReferenceDigest(preparedReference);
  const rejectedJobs = [];

  for (let attempt = 0; attempt < maxBriefAiAttempts; attempt += 1) {
    const attemptExistingJobs = [...(existingJobs || []), ...rejectedJobs];
    const slot = diversitySlot || createContentSlot({ project, product, existingJobs: attemptExistingJobs });
    const brief = await requestAiBrief({
      project,
      product,
      preparedReference,
      activeDesignReference,
      hookDigest,
      existingJobs: attemptExistingJobs,
      slot
    });
    const freshness = diversitySlot?.lockTopic
      ? { ok: true, reasons: [] }
      : assessAiBriefFreshness(brief, attemptExistingJobs);
    if (freshness.ok) return brief;
    rejectedJobs.push(createRejectedBriefJob(brief, freshness));
  }

  throw new Error("AI-команда повторила недавнюю или слишком шаблонную тему. Запустите генерацию еще раз.");
}

async function requestAiBrief({ project, product, preparedReference, activeDesignReference, hookDigest, existingJobs, slot }) {
  const response = await fetch("/api/generation/brief", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(createCreativeTeamPayload({
      project,
      product,
      reference: preparedReference,
      activeDesignReference,
      layoutContentPlan: createLayoutContentPlan(preparedReference),
      hookLibrary: hookDigest,
      existingJobs: createRecentJobDigest(existingJobs),
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

function normalizeAiBrief(draft, diversitySlot) {
  const creativeBrief = draft.creativeBrief || {};
  const contentScript = draft.contentScript || draft.plan || {};
  const topic = diversitySlot.lockTopic
    ? diversitySlot.topic
    : draft.topic || creativeBrief.topic || diversitySlot.topic || "";
  const hook = draft.hook || draft.recommendedHook || diversitySlot.hook || "";
  const plan = draft.plan || {
    headline: contentScript.headline || hook,
    subhead: contentScript.subhead || "",
    points: Array.isArray(contentScript.points) ? contentScript.points : []
  };
  return {
    ...draft,
    topic,
    hook,
    format: draft.format || creativeBrief.formatIntent || diversitySlot.format || "",
    pointCount: draft.pointCount || String(plan.points?.length || ""),
    visualObject: draft.visualObject || draft.visualBrief?.mainVisualObject || diversitySlot.visualObject || "",
    cta: draft.cta || "",
    notes: "AI-сгенерированный бриф на основе проекта, продукта и истории тем.",
    aiPlan: plan,
    productInsightMap: buildProductInsightMap({ insightMap: draft.productInsightMap }),
    sourceHook: draft.sourceHook || draft.hookReference?.text || "",
    hookIntelligence: draft.hookIntelligence || {},
    layoutContentPlan: draft.layoutContentPlan || diversitySlot.layoutContentPlan || {},
    creativeQuality: draft.qualityChecks || draft.creativeQuality || {},
    scrollStopperAngle: draft.scrollStopperAngle || "",
    productFact: draft.productFact || "",
    productPositiveBridge: draft.productPositiveBridge || "",
    semanticKey: diversitySlot.id || draft.semanticKey,
    contentLayer: diversitySlot.contentLayer || null,
    contentLayerId: diversitySlot.contentLayer?.id || "",
    diversitySlot
  };
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
