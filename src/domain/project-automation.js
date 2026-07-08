import { countSuccessfulGenerationJobs } from "./job-quota.js";

export const defaultAutomation = {
  enabled: false,
  targetCount: 10,
  batchSize: 1,
  concurrency: 1,
  status: "idle",
  lastMessage: ""
};

export function normalizeProjectAutomation(value = {}) {
  return {
    enabled: Boolean(value.enabled),
    targetCount: clampAutomationNumber(value.targetCount, defaultAutomation.targetCount, 1, 500),
    batchSize: clampAutomationNumber(value.batchSize, defaultAutomation.batchSize, 1, 10),
    concurrency: clampAutomationNumber(value.concurrency, defaultAutomation.concurrency, 1, 5),
    status: value.status || defaultAutomation.status,
    lastMessage: value.lastMessage || ""
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
