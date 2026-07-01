import { normalizeProjectAutomation } from "../domain/project-automation.js";
import { ensureRussianImageTextRestriction } from "../domain/language-policy.js";
import {
  createAudioEntity,
  createId,
  createProductEntity,
  defaultProjectExportFolder,
  defaultProjectYandexDiskFolder
} from "./factories.js";

export function createProjectBundle(payload = {}) {
  const name = payload.name || "Новый проект";
  const project = {
    id: payload.id || createId("project"),
    client: "Anton Studio",
    name,
    exportFolder: payload.exportFolder || defaultProjectExportFolder(name),
    yandexDiskFolder: payload.yandexDiskFolder || defaultProjectYandexDiskFolder(name),
    dailyLimit: Number(payload.dailyLimit || 20),
    usedToday: 0,
    projectLimit: Number(payload.projectLimit || 500),
    usedTotal: 0,
    automation: normalizeProjectAutomation(),
    ctaOverlay: {
      enabled: true,
      mode: "badge",
      text: "ЧИТАЙ ОПИСАНИЕ",
      x: 50,
      y: 78,
      scale: 100,
      opacity: 100,
      background: "#ffffff",
      color: "#111111",
      border: "#111111",
      radius: 10
    },
    companyInfo: payload.companyInfo || "",
    companyAudience: payload.companyAudience || "",
    projectTheme: payload.projectTheme || "",
    niche: payload.niche || "",
    keyScenarios: payload.keyScenarios || "",
    audiencePains: payload.audiencePains || "",
    audienceDesires: payload.audienceDesires || "",
    audienceObjections: payload.audienceObjections || "",
    allowedTriggers: payload.allowedTriggers || "",
    forbiddenTriggers: payload.forbiddenTriggers || "",
    hookAggression: payload.hookAggression || "Средняя",
    contentRestrictions: ensureRussianImageTextRestriction(payload.contentRestrictions),
    toneOfVoice: payload.toneOfVoice || "спокойный экспертный",
    restrictions: payload.restrictions || "Не обещать лечение, диагнозы, гарантированный результат или обход правил.",
    style: payload.style || "единый проектный стиль инфографики",
    lastReferenceUpdate: new Date().toISOString().slice(0, 10),
    references: [],
    audioLibrary: [createAudioEntity({ title: "Default audio 100 BPM", mood: "нейтрально", duration: "5 sec" })],
    characters: [{
      id: createId("char"),
      name: "Новый персонаж",
      status: "draft",
      prompt: "персонаж проекта, чистый фон, стабильный образ"
    }]
  };
  return {
    project,
    product: createProductEntity(project.id, payload.productName || "Первый продукт")
  };
}
