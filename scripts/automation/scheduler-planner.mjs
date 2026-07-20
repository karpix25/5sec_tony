import { getProjectAutomationState, normalizeProjectAutomation } from "../../src/domain/project-automation.js";
import { buildAutomationBatchSelection } from "./automation-selection.mjs";
import { rescueStaleBriefJobsInState } from "./stale-brief-jobs.mjs";

const defaultMaxProjectsPerTick = 20;

export function claimAutomationDispatches(state, options = {}) {
  const now = Number(options.now || Date.now());
  const nowIso = new Date(now).toISOString();
  const maxProjects = Math.max(1, Number(options.maxProjectsPerTick || defaultMaxProjectsPerTick));
  const rescuedResult = rescueStaleBriefJobsInState(state, { now, staleMs: options.staleBriefTimeoutMs });
  let changed = rescuedResult.rescuedJobs.length > 0;
  const dispatches = [];
  const projects = (rescuedResult.state.projects || []).map((project) => {
    const automationState = getProjectAutomationState({ project, jobs: rescuedResult.state.jobs || [], now });
    const { automation } = automationState;
    if (!automation.enabled) return project;
    if (automationState.isDispatchLocked) return project;

    const nextAutomation = getNextAutomationPatch(automationState, dispatches.length < maxProjects, nowIso);
    if (nextAutomation && hasSameAutomationPatch(automation, nextAutomation)) return project;
    if (!nextAutomation) return project;
    changed = true;
    if (nextAutomation.status === "dispatching") {
      dispatches.push(createDispatch(project, automationState.nextCount, rescuedResult.state));
    }
    return {
      ...project,
      automation: normalizeProjectAutomation({ ...automation, ...nextAutomation })
    };
  });

  return {
    state: changed ? { ...rescuedResult.state, projects } : state,
    dispatches,
    rescued: rescuedResult.rescuedJobs.length
  };
}

function hasSameAutomationPatch(automation, patch) {
  const next = normalizeProjectAutomation({ ...automation, ...patch });
  return automation.enabled === next.enabled
    && automation.status === next.status
    && automation.lastMessage === next.lastMessage
    && automation.dispatchStartedAt === next.dispatchStartedAt;
}

function getNextAutomationPatch(automationState, canClaimMore, nowIso) {
  const { activeJobs, remainingDaily, remainingProject, canRun } = automationState;
  if (canRun && canClaimMore) {
    return {
      status: "dispatching",
      lastMessage: "Серверный авторежим готовит новую пачку задач.",
      dispatchStartedAt: nowIso
    };
  }
  if (activeJobs > 0) return { status: "running", lastMessage: "Авторежим ждёт завершения активных задач.", dispatchStartedAt: "" };
  if (!remainingProject) {
    return { enabled: false, status: "done", lastMessage: "Лимит проекта исчерпан. Авторежим выключен.", dispatchStartedAt: "" };
  }
  if (!remainingDaily) {
    return {
      status: "waiting",
      lastMessage: "Дневной лимит исчерпан. Авторежим включен и продолжит после обновления дневного лимита.",
      dispatchStartedAt: ""
    };
  }
  return null;
}

function createDispatch(project, count, state) {
  return {
    projectId: project.id,
    count,
    selection: buildAutomationBatchSelection(state, project)
  };
}
