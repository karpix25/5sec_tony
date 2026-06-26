import { createUniqueJobId } from "./job-identity.js";

export function createPendingGenerationJob(job, index = 0, count = 1, extra = {}) {
  const label = count > 1 ? ` ${index + 1}/${count}` : "";
  return {
    ...job,
    ...extra,
    id: job.id || createUniqueJobId([]),
    status: "running",
    stage: "brief",
    isBriefPlaceholder: true,
    briefStartedAt: extra.briefStartedAt || new Date().toISOString(),
    progress: 3,
    title: `Готовим AI-бриф${label}`,
    prompt: "",
    topic: "AI-команда собирает сценарий и промпт",
    inputUrls: [],
    inputRefs: [],
    imageUrl: "",
    imageData: "",
    finalVideoUrl: "",
    failMsg: "AI-команда собирает паспорт продукта, сценарий и промпт..."
  };
}
