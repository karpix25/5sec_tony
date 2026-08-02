import { assertBullMqConfig } from "../job-queue-dispatcher.mjs";
import { normalizeProjectAutomation } from "../../src/domain/project-automation.js";
import { updateGenerationState } from "../generation-state.mjs";
import { createGenerationBatch } from "../generation-batch-runner.mjs";
import { processAudioLibraryRefreshReminder } from "../audio-refresh-reminders.mjs";
import { claimAutomationDispatches } from "./scheduler-planner.mjs";
import { getAutomationErrorMessage, markAutomationStatus } from "./scheduler-status.mjs";
import { withAutomationSchedulerLock } from "./scheduler-lock.mjs";
import { loadAutomationState, persistAutomationStateDelta, shouldUseRelationalAutomation } from "./relational-state-store.mjs";

export async function runLockedAutomationSchedulerOnce(options = {}) {
  const deps = options.deps || {};
  const lock = deps.withAutomationSchedulerLock || withAutomationSchedulerLock;
  return lock(() => runAutomationSchedulerOnce(options), options);
}

export async function runAutomationSchedulerOnce(options = {}) {
  const deps = options.deps || {};
  const env = options.env || process.env;
  const audioLibraryReminder = await processAudioReminder(options, deps);
  const queueReady = ensureStrictQueue(env, deps);
  if (!queueReady.ok) return { ...await markEnabledProjectsQueueError(queueReady.error, deps), audioLibraryReminder };

  const claim = await claimDispatches(options, deps);
  const results = [];
  for (const dispatch of claim.dispatches) {
    results.push(await runDispatch(dispatch, options, deps));
  }
  return { ...claim, results, audioLibraryReminder };
}

async function processAudioReminder(options, deps) {
  const processReminder = deps.processAudioLibraryRefreshReminder || processAudioLibraryRefreshReminder;
  try {
    return await processReminder({ ...(deps.audioLibraryReminderDeps || {}), now: options.now });
  } catch (error) {
    return { processed: 0, skipped: false, error: error.message || String(error) };
  }
}

function ensureStrictQueue(env, deps) {
  try {
    const assertQueue = deps.assertBullMqConfig || assertBullMqConfig;
    assertQueue(env, { requireStrict: true });
    return { ok: true, error: null };
  } catch (error) {
    return { ok: false, error };
  }
}

async function claimDispatches(options, deps) {
  if (shouldUseRelationalAutomation(deps)) {
    const loadState = deps.loadGenerationState || loadAutomationState;
    const persist = deps.persistAutomationStateDelta || persistAutomationStateDelta;
    const current = await loadState(deps);
    const claim = claimAutomationDispatches(current, {
      now: options.now,
      maxProjectsPerTick: options.maxProjectsPerTick,
      staleBriefTimeoutMs: options.staleBriefTimeoutMs
    });
    if (claim.state !== current) await persist(current, claim.state, { ...deps, optimizedPersistence: true });
    return { dispatches: claim.dispatches, rescued: claim.rescued, state: claim.state };
  }
  const updateState = deps.updateGenerationState || updateGenerationState;
  let dispatches = [];
  let rescued = 0;
  const result = await updateState((state) => {
    const claim = claimAutomationDispatches(state, {
      now: options.now,
      maxProjectsPerTick: options.maxProjectsPerTick,
      staleBriefTimeoutMs: options.staleBriefTimeoutMs
    });
    dispatches = claim.dispatches;
    rescued = claim.rescued;
    return claim.state;
  }, deps);
  return { dispatches, rescued, state: result.state || result };
}

async function runDispatch(dispatch, options, deps) {
  try {
    const createBatch = deps.createGenerationBatch || createGenerationBatch;
    const payload = await createBatch({
      count: dispatch.count,
      distributeProducts: true,
      source: "automation",
      origin: getAutomationOrigin(options.env || process.env),
      selection: dispatch.selection,
      deps: { ...(deps.generationBatchDeps || {}), optimizedPersistence: shouldUseRelationalAutomation(deps) }
    });
    const jobs = payload.jobs || [];
    await markAutomationStatus(dispatch.projectId, {
      status: "running",
      lastMessage: `Запущено задач: ${jobs.length || dispatch.count}.`,
      dispatchStartedAt: ""
    }, { ...deps, optimizedPersistence: shouldUseRelationalAutomation(deps) });
    return { projectId: dispatch.projectId, ok: true, count: jobs.length || dispatch.count, batchId: payload.batchId || "" };
  } catch (error) {
    await markAutomationStatus(dispatch.projectId, {
      status: "error",
      lastMessage: getAutomationErrorMessage(error),
      dispatchStartedAt: ""
    }, deps);
    return { projectId: dispatch.projectId, ok: false, error: error.message || String(error) };
  }
}

async function markEnabledProjectsQueueError(error, deps) {
  const updateState = deps.updateGenerationState || updateGenerationState;
  const message = `Серверная очередь не настроена. Авторежим не запущен: ${error.message || error}.`;
  const result = await updateState((state) => ({
    ...state,
    projects: (state.projects || []).map((project) => {
      if (!project.automation?.enabled) return project;
      return {
        ...project,
        automation: normalizeProjectAutomation({
          ...(project.automation || {}),
          enabled: true,
          status: "error",
          lastMessage: message,
          dispatchStartedAt: ""
        })
      };
    })
  }), deps);
  return { dispatches: [], rescued: 0, results: [], state: result.state || result, queueError: message };
}

function getAutomationOrigin(env) {
  return env.AUTOMATION_ORIGIN || env.INTERNAL_SERVER_ORIGIN || `http://127.0.0.1:${env.PORT || 4173}`;
}
