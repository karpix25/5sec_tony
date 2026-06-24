import { normalizeProjectAutomation } from "../domain/project-automation.js";
import { normalizeProductInFramePercent } from "../domain/product-visual-policy.js";
import { defaultProjectYandexDiskFolder } from "./factories.js";
import { normalizeProjectDailyLimit, normalizeProjectTotalLimit } from "./store-normalizers.js";

export function updateProjectEntity(project, payload) {
  const value = (name, fallback = "") => Object.hasOwn(payload, name) ? payload[name] : (project[name] || fallback);
  const textValue = (name, fallback = "") => projectTextValue(value(name, fallback));
  const projectAbout = Object.hasOwn(payload, "projectTheme") ? payload.projectTheme : null;
  const exportFolder = textValue("exportFolder", project.exportFolder);
  const yandexDiskFolder = textValue("yandexDiskFolder", project.yandexDiskFolder || defaultProjectYandexDiskFolder(project.name || "Проект"));
  return {
    ...project,
    name: projectTextValue(payload.name || project.name),
    exportFolder,
    yandexDiskFolder,
    dailyLimit: normalizeProjectDailyLimit(value("dailyLimit", project.dailyLimit || 20)),
    projectLimit: normalizeProjectTotalLimit(value("projectLimit", project.projectLimit || 500)),
    productInFramePercent: normalizeProductInFramePercent(value("productInFramePercent", project.productInFramePercent)),
    projectTheme: textValue("projectTheme"),
    niche: textValue("niche"),
    keyScenarios: textValue("keyScenarios"),
    audiencePains: textValue("audiencePains"),
    audienceDesires: textValue("audienceDesires"),
    audienceObjections: textValue("audienceObjections"),
    allowedTriggers: textValue("allowedTriggers"),
    forbiddenTriggers: textValue("forbiddenTriggers"),
    hookAggression: textValue("hookAggression", "Средняя"),
    contentRestrictions: textValue("contentRestrictions"),
    companyInfo: projectTextValue(Object.hasOwn(payload, "companyInfo") ? payload.companyInfo : (projectAbout ?? project.companyInfo ?? "")),
    companyAudience: textValue("companyAudience"),
    toneOfVoice: textValue("toneOfVoice"),
    restrictions: textValue("restrictions"),
    style: textValue("style", project.style),
    automation: normalizeProjectAutomation(project.automation)
  };
}

function projectTextValue(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(projectTextValue).filter(Boolean).join("\n");
  if (typeof value === "object") return Object.values(value).map(projectTextValue).filter(Boolean).join(" — ");
  return String(value);
}

export function withCreatedJobs(state, jobs, projectId) {
  if (!jobs.length) return { jobs: state.jobs };
  return {
    jobs: [...jobs, ...state.jobs]
  };
}
