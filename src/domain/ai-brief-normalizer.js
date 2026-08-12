import { buildProductInsightMap } from "./product-insights.js";
import { normalizeHumanizedLine, normalizeHumanizedPlan } from "./text-humanizer.js";
import { sanitizeTextTree } from "./text-integrity.js";

export function normalizeAiBrief(draft = {}, diversitySlot = {}) {
  const cleanDraft = sanitizeTextTree(draft || {});
  const cleanSlot = sanitizeTextTree(diversitySlot || {});
  const creativeBrief = cleanDraft.creativeBrief || {};
  const contentScript = cleanDraft.contentScript || cleanDraft.plan || {};
  const rawTopic = cleanSlot.lockTopic
    ? cleanSlot.topic
    : cleanDraft.topic || creativeBrief.topic || cleanSlot.topic || "";
  const rawHook = cleanDraft.hook || cleanDraft.recommendedHook || cleanSlot.hook || "";
  const rawPlan = cleanDraft.plan || {
    headline: contentScript.headline || rawHook,
    subhead: contentScript.subhead || "",
    points: Array.isArray(contentScript.points) ? contentScript.points : []
  };
  const plan = normalizeHumanizedPlan(rawPlan, rawPlan);
  const topic = normalizeHumanizedLine(rawTopic) || plan.headline;
  const hook = normalizeHumanizedLine(rawHook) || plan.headline;
  return {
    ...cleanDraft,
    topic,
    hook,
    format: cleanDraft.format || creativeBrief.formatIntent || cleanSlot.format || "",
    pointCount: cleanDraft.pointCount || String(plan.points?.length || ""),
    visualObject: cleanDraft.visualObject || cleanDraft.visualBrief?.mainVisualObject || cleanSlot.visualObject || "",
    cta: cleanDraft.cta || "",
    notes: "AI-сгенерированный бриф на основе проекта, продукта и истории тем.",
    aiPlan: plan,
    productInsightMap: buildProductInsightMap({ insightMap: cleanDraft.productInsightMap }),
    sourceHook: cleanDraft.sourceHook || cleanDraft.hookReference?.text || "",
    hookIntelligence: cleanDraft.hookIntelligence || {},
    layoutContentPlan: cleanDraft.layoutContentPlan || cleanSlot.layoutContentPlan || {},
    creativeQuality: cleanDraft.qualityChecks || cleanDraft.creativeQuality || {},
    productPassport: cleanDraft.productPassport || null,
    designFormatBrief: cleanDraft.designFormatBrief || cleanDraft.designAnalysis || null,
    attentionMap: cleanDraft.attentionMap || null,
    creativeBrief: cleanDraft.creativeBrief || null,
    avatarEmotionName: cleanDraft.avatarEmotionName || cleanDraft.creativeBrief?.avatarEmotionName || "",
    availableAvatarEmotions: Array.isArray(cleanDraft.availableAvatarEmotions) ? cleanDraft.availableAvatarEmotions : [],
    contentScript: cleanDraft.contentScript ? { ...cleanDraft.contentScript, ...plan } : null,
    visualBrief: cleanDraft.visualBrief || null,
    imagePromptPackage: cleanDraft.imagePromptPackage || null,
    imagePromptContract: cleanDraft.imagePromptContract || null,
    productVisibilityDecision: cleanDraft.productVisibilityDecision || null,
    topicCluster: cleanDraft.topicCluster || cleanSlot.topicCluster || null,
    topicClusterPlan: cleanDraft.topicClusterPlan || null,
    hookSeed: cleanDraft.hookSeed || cleanDraft.sourceHook || "",
    qaReview: cleanDraft.qaReview || cleanDraft.safetyReview || cleanDraft.qualityChecks || null,
    scrollStopperAngle: cleanDraft.scrollStopperAngle || "",
    productFact: cleanDraft.productFact || "",
    productPositiveBridge: cleanDraft.productPositiveBridge || "",
    semanticKey: cleanSlot.id || cleanDraft.semanticKey,
    contentLayer: cleanSlot.contentLayer || null,
    contentLayerId: cleanSlot.contentLayer?.id || "",
    diversitySlot: cleanSlot
  };
}
