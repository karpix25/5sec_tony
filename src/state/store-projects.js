import { normalizeProjectAutomation } from "../domain/project-automation.js";
import { defaultProjectYandexDiskFolder } from "./factories.js";
import { normalizeProjectDailyLimit, normalizeProjectTotalLimit } from "./store-normalizers.js";

export function updateProjectEntity(project, payload) {
  const value = (name, fallback = "") => Object.hasOwn(payload, name) ? payload[name] : (project[name] || fallback);
  const projectAbout = Object.hasOwn(payload, "projectTheme") ? payload.projectTheme : null;
  const exportFolder = value("exportFolder", project.exportFolder);
  const yandexDiskFolder = value("yandexDiskFolder", project.yandexDiskFolder || defaultProjectYandexDiskFolder(project.name || "Проект"));
  return {
    ...project,
    name: payload.name || project.name,
    exportFolder,
    yandexDiskFolder,
    dailyLimit: normalizeProjectDailyLimit(value("dailyLimit", project.dailyLimit || 20)),
    projectLimit: normalizeProjectTotalLimit(value("projectLimit", project.projectLimit || 500)),
    projectTheme: value("projectTheme"),
    niche: value("niche"),
    keyScenarios: value("keyScenarios"),
    audiencePains: value("audiencePains"),
    audienceDesires: value("audienceDesires"),
    audienceObjections: value("audienceObjections"),
    allowedTriggers: value("allowedTriggers"),
    forbiddenTriggers: value("forbiddenTriggers"),
    hookAggression: value("hookAggression", "Средняя"),
    contentRestrictions: value("contentRestrictions"),
    companyInfo: Object.hasOwn(payload, "companyInfo") ? payload.companyInfo : (projectAbout ?? project.companyInfo ?? ""),
    companyAudience: value("companyAudience"),
    toneOfVoice: value("toneOfVoice"),
    restrictions: value("restrictions"),
    style: value("style", project.style),
    automation: normalizeProjectAutomation(project.automation)
  };
}

export function withCreatedJobs(state, jobs, projectId) {
  if (!jobs.length) return { jobs: state.jobs };
  return {
    jobs: [...jobs, ...state.jobs]
  };
}
