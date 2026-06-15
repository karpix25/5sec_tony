export const defaultResearchAccounts = [
  "bodyhealth.labs",
  "thehealthymail",
  "finsoroka",
  "motivate.wise"
];

export function normalizeResearchResult(payload = {}) {
  const videos = Array.isArray(payload.videos) ? payload.videos : [];
  const summary = payload.summary || {};
  return {
    updatedAt: new Date().toISOString(),
    accounts: payload.accounts || defaultResearchAccounts,
    modelAnalysis: payload.modelAnalysis || "",
    modelWriting: payload.modelWriting || "",
    errors: Array.isArray(payload.errors) ? payload.errors : [],
    videos: videos.map(normalizeVideo),
    summary: {
      hookPatterns: researchAsList(summary.hookPatterns),
      scenarioPatterns: researchAsList(summary.scenarioPatterns),
      visualPatterns: researchAsList(summary.visualPatterns),
      topicAngles: researchAsList(summary.topicAngles),
      generatorRules: researchAsList(summary.generatorRules),
      reusableHooks: researchAsList(summary.reusableHooks)
    }
  };
}

export function getStoredResearch() {
  try {
    const text = window.localStorage.getItem("anton-reels-research");
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

export function storeResearch(result) {
  try {
    window.localStorage.setItem("anton-reels-research", JSON.stringify(result));
  } catch {}
}

function normalizeVideo(video) {
  return {
    id: video.id || "",
    account: video.account || "",
    url: video.url || "",
    frame: video.frame || "",
    topic: video.topic || "",
    hook: video.hook || "",
    pain: video.pain || "",
    scenarioPattern: video.scenarioPattern || "",
    visualPattern: video.visualPattern || "",
    reusableTemplate: video.reusableTemplate || ""
  };
}

function researchAsList(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value || "").split("\n").map((item) => item.trim()).filter(Boolean);
}
