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
  const completedJobs = projectJobs.filter((job) => job.status === "done").length;
  const remainingDaily = Math.max(0, Number(project?.dailyLimit || 0) - Number(project?.usedToday || 0));
  const remainingTarget = Math.max(0, automation.targetCount - completedJobs - activeJobs);
  const availableSlots = Math.max(0, automation.concurrency - activeJobs);
  const nextCount = Math.min(automation.batchSize, availableSlots, remainingDaily, remainingTarget);

  return {
    automation,
    activeJobs,
    completedJobs,
    remainingDaily,
    remainingTarget,
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
