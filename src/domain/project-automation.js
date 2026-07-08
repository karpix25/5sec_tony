import { countSuccessfulGenerationJobs } from "./job-quota.js";

export const defaultAutomation = {
  enabled: false,
  batchSize: 1,
  concurrency: 1,
  status: "idle",
  lastMessage: ""
};

export function normalizeProjectAutomation(value = {}) {
  const isLegacyCompletedTarget = isLegacyCompletedTargetState(value);
  return {
    enabled: Boolean(value.enabled),
    batchSize: clampAutomationNumber(value.batchSize, defaultAutomation.batchSize, 1, 10),
    concurrency: clampAutomationNumber(value.concurrency, defaultAutomation.concurrency, 1, 5),
    status: isLegacyCompletedTarget ? defaultAutomation.status : value.status || defaultAutomation.status,
    lastMessage: isLegacyCompletedTarget ? "" : value.lastMessage || ""
  };
}

export function getProjectAutomationState({ project, jobs = [] }) {
  const automation = normalizeProjectAutomation(project?.automation);
  const projectJobs = jobs.filter((job) => job.projectId === project?.id);
  const activeJobs = projectJobs.filter((job) => ["queued", "running"].includes(job.status)).length;
  const completedJobs = countSuccessfulGenerationJobs(projectJobs);
  const remainingDaily = Math.max(0, Number(project?.dailyLimit || 0) - Number(project?.usedToday || 0));
  const remainingProject = Math.max(0, Number(project?.projectLimit || 0) - Number(project?.usedTotal || 0));
  const availableSlots = Math.max(0, automation.concurrency - activeJobs);
  const availableDailySlots = Math.max(0, remainingDaily - activeJobs);
  const availableProjectSlots = Math.max(0, remainingProject - activeJobs);
  const nextCount = Math.min(automation.batchSize, availableSlots, availableDailySlots, availableProjectSlots);

  return {
    automation,
    activeJobs,
    completedJobs,
    remainingDaily,
    remainingProject,
    availableSlots,
    nextCount,
    canRun: automation.enabled && nextCount > 0
  };
}

function clampAutomationNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function isLegacyCompletedTargetState(value = {}) {
  return value.status === "done" && /Цель авторежима выполнена/i.test(String(value.lastMessage || ""));
}
