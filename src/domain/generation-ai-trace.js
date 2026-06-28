export function createGenerationAiTrace({ brief = {}, promptContract = {}, inputReferences = [] } = {}) {
  return {
    version: "ai-trace-v1",
    productPassport: brief.productPassport || null,
    designAnalysis: brief.designFormatBrief || null,
    topicCluster: brief.topicCluster || null,
    topicClusterPlan: brief.topicClusterPlan || null,
    hookSeed: brief.hookSeed || brief.sourceHook || "",
    attentionMap: brief.attentionMap || null,
    selectedAngle: brief.creativeBrief?.selectedAngle || brief.creativeBrief?.topic || brief.scrollStopperAngle || "",
    creativePost: {
      creativeBrief: brief.creativeBrief || null,
      contentScript: brief.contentScript || brief.finalContent || null,
      visualBrief: brief.visualBrief || null
    },
    imagePromptContract: promptContract,
    qaReview: brief.qaReview || brief.safetyReview || brief.qualityChecks || null,
    referencesSent: inputReferences.map(({ role, title, url }) => ({ role, title, hasUrl: Boolean(url) }))
  };
}
