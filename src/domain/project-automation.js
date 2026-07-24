import { getDailyUsageInfo, normalizeProjectDailyUsage } from "./daily-usage.js";
import { getAutomationPacing } from "./automation-pacing.js";
import { countSuccessfulGenerationJobs } from "./job-quota.js";

export const defaultAutomation = {
  enabled: false,
  batchSize: 1,
  concurrency: 1,
  status: "idle",
  lastMessage: "",
  dispatchStartedAt: ""
};

export const automationDispatchTimeoutMs = 10 * 60 * 1000;

export function normalizeProjectAutomation(value = {}) {
  const isLegacyCompletedTarget = isLegacyCompletedTargetState(value);
  return {
    enabled: Boolean(value.enabled),
    batchSize: clampAutomationNumber(value.batchSize, defaultAutomation.batchSize, 1, 10),
    concurrency: clampAutomationNumber(value.concurrency, defaultAutomation.concurrency, 1, 5),
    status: isLegacyCompletedTarget ? defaultAutomation.status : value.status || defaultAutomation.status,
    lastMessage: isLegacyCompletedTarget ? "" : value.lastMessage || "",
    dispatchStartedAt: value.dispatchStartedAt || ""
  };
}

export function getProjectAutomationState({ project, jobs = [], now = Date.now() }) {
  const normalizedProject = normalizeProjectDailyUsage(project, { now });
  const automation = normalizeProjectAutomation(normalizedProject?.automation);
  const projectJobs = jobs.filter((job) => job.projectId === normalizedProject?.id);
  const activeJobs = projectJobs.filter((job) => ["queued", "running"].includes(job.status)).length;
  const completedJobs = countSuccessfulGenerationJobs(projectJobs);
  const dailyUsage = getDailyUsageInfo(normalizedProject, { now });
  const remainingDaily = dailyUsage.remaining;
  const remainingProject = Math.max(0, Number(normalizedProject?.projectLimit || 0) - Number(normalizedProject?.usedTotal || 0));
  const pacing = getAutomationPacing({
    dailyLimit: dailyUsage.limit,
    usedToday: dailyUsage.used,
    activeJobs,
    remainingProject,
    now
  });
  const nextCount = pacing.nextCount;
  const isBlockedByError = automation.status === "error";
  const isDispatchLocked = isAutomationDispatchLocked(automation, now);

  return {
    automation,
    activeJobs,
    completedJobs,
    remainingDaily,
    dailyUsage,
    remainingProject,
    availableSlots: pacing.availableParallel,
    pacing,
    nextCount,
    isDispatchLocked,
    canRun: automation.enabled && !isBlockedByError && !isDispatchLocked && nextCount > 0
  };
}

export function isAutomationDispatchLocked(automation = {}, now = Date.now()) {
  const normalized = normalizeProjectAutomation(automation);
  if (normalized.status !== "dispatching") return false;
  const startedAt = Date.parse(normalized.dispatchStartedAt || "");
  if (!Number.isFinite(startedAt)) return true;
  return now - startedAt < automationDispatchTimeoutMs;
}

function clampAutomationNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function isLegacyCompletedTargetState(value = {}) {
  return value.status === "done" && /Цель авторежима выполнена/i.test(String(value.lastMessage || ""));
}
