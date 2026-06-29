import { buildProductInsightMap } from "./product-insights.js";

export function normalizeAiBrief(draft = {}, diversitySlot = {}) {
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
    productPassport: draft.productPassport || null,
    designFormatBrief: draft.designFormatBrief || draft.designAnalysis || null,
    attentionMap: draft.attentionMap || null,
    creativeBrief: draft.creativeBrief || null,
    avatarEmotionName: draft.avatarEmotionName || draft.creativeBrief?.avatarEmotionName || "",
    availableAvatarEmotions: Array.isArray(draft.availableAvatarEmotions) ? draft.availableAvatarEmotions : [],
    contentScript: draft.contentScript || null,
    visualBrief: draft.visualBrief || null,
    imagePromptPackage: draft.imagePromptPackage || null,
    imagePromptContract: draft.imagePromptContract || null,
    productVisibilityDecision: draft.productVisibilityDecision || null,
    topicCluster: draft.topicCluster || diversitySlot.topicCluster || null,
    topicClusterPlan: draft.topicClusterPlan || null,
    hookSeed: draft.hookSeed || draft.sourceHook || "",
    qaReview: draft.qaReview || draft.safetyReview || draft.qualityChecks || null,
    scrollStopperAngle: draft.scrollStopperAngle || "",
    productFact: draft.productFact || "",
    productPositiveBridge: draft.productPositiveBridge || "",
    semanticKey: diversitySlot.id || draft.semanticKey,
    contentLayer: diversitySlot.contentLayer || null,
    contentLayerId: diversitySlot.contentLayer?.id || "",
    diversitySlot
  };
}
