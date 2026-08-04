import test from "node:test";
import assert from "node:assert/strict";
import { createAutomationScheduler } from "../scripts/automation-scheduler.mjs";
import { runAutomationSchedulerOnce } from "../scripts/automation/scheduler-tick.mjs";
import { claimAutomationDispatches } from "../scripts/automation/scheduler-planner.mjs";
import { buildAutomationBatchSelection } from "../scripts/automation/automation-selection.mjs";
import { isStaleBriefPlaceholder } from "../scripts/automation/stale-brief-jobs.mjs";
import { tryLockAutomationScheduler } from "../scripts/automation/scheduler-lock.mjs";

const strictQueueEnv = {
  JOB_QUEUE_MODE: "bullmq",
  REDIS_HOST: "tools-redis",
  JOB_QUEUE_STRICT: "true",
  AUTOMATION_ORIGIN: "http://web:4173"
};

test("server automation scheduler creates a strict queued batch for enabled project", async () => {
  const stateStore = createStateStore({
    selectedProjectId: "selected-project",
    projects: [
      createProject("selected-project", { automation: { enabled: false } }),
      createProject("auto-project", { automation: { enabled: true, batchSize: 10, concurrency: 5 } })
    ],
    jobs: [
      { id: "active-1", projectId: "auto-project", status: "running" },
      { id: "active-2", projectId: "auto-project", status: "queued", queueStatus: "queued" },
      { id: "done-1", projectId: "auto-project", status: "done", finalVideoUrl: "/ok.mp4" }
    ],
    audioLibrary: [{ id: "audio-global", title: "Audio" }]
  });
  const calls = [];

  const result = await runAutomationSchedulerOnce({
    now: getMiddayTodayMs(),
    env: strictQueueEnv,
    deps: {
      updateGenerationState: stateStore.updateGenerationState,
      dispatchGenerationBatch: async (payload) => {
        calls.push(payload);
        return { batchId: "batch-1", jobs: [{ id: "job-1" }, { id: "job-2" }, { id: "job-3" }] };
      }
    }
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].count, 3);
  assert.equal(calls[0].distributeProducts, true);
  assert.equal(calls[0].source, "automation");
  assert.equal(calls[0].origin, "http://web:4173");
  assert.equal(calls[0].selection.projectId, "auto-project");
  assert.notEqual(calls[0].selection.projectId, "selected-project");
  assert.equal(result.results[0].ok, true);
  assert.equal(stateStore.state.projects[1].automation.status, "running");
  assert.match(stateStore.state.projects[1].automation.lastMessage, /Запущено задач: 3/);
});

test("scheduler dispatches batches through the backend HTTP boundary by default", async () => {
  const stateStore = createStateStore({
    projects: [createProject("http-project", { automation: { enabled: true, batchSize: 2, concurrency: 2 } })]
  });
  const requests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, request) => {
    requests.push({ url, body: JSON.parse(request.body) });
    return { ok: true, status: 202, json: async () => ({ batchId: "http-batch", jobs: [{ id: "job-1" }] }) };
  };
  try {
    const result = await runAutomationSchedulerOnce({
      env: strictQueueEnv,
      deps: { updateGenerationState: stateStore.updateGenerationState }
    });
    assert.equal(result.results[0].ok, true);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "http://web:4173/api/generation/batches");
    assert.deepEqual(requests[0].body, {
      count: 2,
      distributeProducts: true,
      source: "automation",
      selection: requests[0].body.selection,
      requireQueue: true
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("scheduler continues dispatching other projects after one backend error", async () => {
  const stateStore = createStateStore({
    projects: [
      createProject("failed-project", { automation: { enabled: true, batchSize: 1, concurrency: 1 } }),
      createProject("healthy-project", { automation: { enabled: true, batchSize: 1, concurrency: 1 } })
    ]
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, request) => {
    const projectId = JSON.parse(request.body).selection.projectId;
    if (projectId === "failed-project") {
      return { ok: false, status: 503, json: async () => ({ code: "PROVIDER_BUSY", error: "provider busy" }) };
    }
    return { ok: true, status: 202, json: async () => ({ batchId: "healthy-batch", jobs: [{ id: "job-2" }] }) };
  };
  try {
    const result = await runAutomationSchedulerOnce({
      env: strictQueueEnv,
      maxProjectsPerTick: 2,
      deps: { updateGenerationState: stateStore.updateGenerationState }
    });
    assert.equal(result.results.length, 2);
    assert.equal(result.results[0].ok, false);
    assert.equal(result.results[1].ok, true);
    assert.equal(stateStore.state.projects[0].automation.status, "error");
    assert.equal(stateStore.state.projects[1].automation.status, "running");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("scheduler start is idempotent and cannot create overlapping loops", async () => {
  const stateStore = createStateStore({ projects: [] });
  let cycles = 0;
  const scheduler = createAutomationScheduler({
    once: true,
    deps: {
      updateGenerationState: stateStore.updateGenerationState,
      withAutomationSchedulerLock: async (run) => {
        cycles += 1;
        return run();
      }
    },
    logger: { log() {}, error() {} }
  });
  const first = scheduler.start();
  const second = scheduler.start();
  assert.equal(first, second);
  await Promise.all([first, second]);
  assert.equal(cycles, 1);
});

test("server automation scheduler waits at daily limit without disabling autorun", async () => {
  const stateStore = createStateStore({
    projects: [createProject("daily-full", {
      dailyLimit: 5,
      usedToday: 5,
      dailyUsageDate: getTodayDateString(),
      automation: { enabled: true, batchSize: 5, concurrency: 5 }
    })]
  });
  let batchCalls = 0;

  await runAutomationSchedulerOnce({
    env: strictQueueEnv,
    deps: {
      updateGenerationState: stateStore.updateGenerationState,
      dispatchGenerationBatch: async () => { batchCalls += 1; }
    }
  });

  const automation = stateStore.state.projects[0].automation;
  assert.equal(batchCalls, 0);
  assert.equal(automation.enabled, true);
  assert.equal(automation.status, "waiting");
  assert.match(automation.lastMessage, /Дневной лимит исчерпан/);
});

test("server automation scheduler disables autorun when project limit is reached", async () => {
  const stateStore = createStateStore({
    projects: [createProject("project-full", {
      projectLimit: 12,
      usedTotal: 12,
      automation: { enabled: true, batchSize: 5, concurrency: 5 }
    })]
  });

  await runAutomationSchedulerOnce({
    env: strictQueueEnv,
    deps: {
      updateGenerationState: stateStore.updateGenerationState,
      dispatchGenerationBatch: async () => assert.fail("batch should not be created")
    }
  });

  const automation = stateStore.state.projects[0].automation;
  assert.equal(automation.enabled, false);
  assert.equal(automation.status, "done");
  assert.match(automation.lastMessage, /Лимит проекта исчерпан/);
});

test("server automation scheduler disables exhausted autorun even with active jobs", async () => {
  const stateStore = createStateStore({
    projects: [createProject("auto-project", {
      projectLimit: 1,
      usedTotal: 5,
      automation: { enabled: true, batchSize: 5, concurrency: 5 }
    })],
    jobs: [
      { id: "active-old", projectId: "auto-project", status: "running", stage: "image" }
    ]
  });

  await runAutomationSchedulerOnce({
    env: strictQueueEnv,
    deps: {
      updateGenerationState: stateStore.updateGenerationState,
      dispatchGenerationBatch: async () => assert.fail("batch should not be created")
    }
  });

  const automation = stateStore.state.projects[0].automation;
  assert.equal(automation.enabled, false);
  assert.equal(automation.status, "done");
  assert.match(automation.lastMessage, /Лимит проекта исчерпан/);
});

test("server automation scheduler marks queue config errors without creating batches", async () => {
  const stateStore = createStateStore({
    projects: [createProject("queue-error", { automation: { enabled: true, batchSize: 2, concurrency: 2 } })]
  });
  let batchCalls = 0;

  const result = await runAutomationSchedulerOnce({
    env: { JOB_QUEUE_MODE: "inline" },
    deps: {
      updateGenerationState: stateStore.updateGenerationState,
      dispatchGenerationBatch: async () => { batchCalls += 1; }
    }
  });

  const automation = stateStore.state.projects[0].automation;
  assert.equal(batchCalls, 0);
  assert.match(result.queueError, /Серверная очередь не настроена/);
  assert.equal(automation.enabled, true);
  assert.equal(automation.status, "error");
});

test("server automation scheduler runs backend audio library reminder check", async () => {
  const stateStore = createStateStore({ projects: [] });
  const reminderCalls = [];

  const result = await runAutomationSchedulerOnce({
    env: strictQueueEnv,
    now: Date.parse("2026-07-21T10:00:00.000Z"),
    deps: {
      updateGenerationState: stateStore.updateGenerationState,
      processAudioLibraryRefreshReminder: async (payload) => {
        reminderCalls.push(payload.now);
        return { processed: 1, skipped: false };
      }
    }
  });

  assert.deepEqual(reminderCalls, [Date.parse("2026-07-21T10:00:00.000Z")]);
  assert.deepEqual(result.audioLibraryReminder, { processed: 1, skipped: false });
});

test("automation dispatch claim prevents duplicate concurrent scheduler ticks", () => {
  const state = createBaseState({
    projects: [createProject("no-dupes", { automation: { enabled: true, batchSize: 3, concurrency: 3 } })]
  });

  const first = claimAutomationDispatches(state, { now: Date.parse("2026-07-20T10:00:00.000Z") });
  const second = claimAutomationDispatches(first.state, { now: Date.parse("2026-07-20T10:01:00.000Z") });

  assert.equal(first.dispatches.length, 1);
  assert.equal(second.dispatches.length, 0);
  assert.equal(first.state.projects[0].automation.status, "dispatching");
});

test("automation scheduler lock uses a dedicated Postgres advisory lock", async () => {
  const queries = [];
  const locked = await tryLockAutomationScheduler(async (text, params) => {
    queries.push({ text, params });
    return { rows: [{ locked: true }] };
  }, "test:automation-scheduler");

  assert.equal(locked, true);
  assert.match(queries[0].text, /pg_try_advisory_xact_lock/);
  assert.deepEqual(queries[0].params, ["test:automation-scheduler"]);
});

test("automation dispatch claim can recover an expired dispatch lease", () => {
  const state = createBaseState({
    projects: [createProject("expired-dispatch", {
      automation: {
        enabled: true,
        batchSize: 2,
        concurrency: 2,
        status: "dispatching",
        dispatchStartedAt: "2026-07-20T09:00:00.000Z"
      }
    })]
  });

  const claim = claimAutomationDispatches(state, { now: Date.parse("2026-07-20T09:20:01.000Z") });

  assert.equal(claim.dispatches.length, 1);
  assert.equal(claim.dispatches[0].projectId, "expired-dispatch");
});

test("scheduler rescues stale server-owned brief placeholders before planning", () => {
  const staleJob = {
    id: "stale-brief",
    serverBatchId: "batch-stale",
    projectId: "rescued-project",
    status: "queued",
    stage: "brief",
    progress: 6,
    serverOwned: true,
    isBriefPlaceholder: true,
    briefStartedAt: "2026-07-20T09:00:00.000Z",
    queueStatus: ""
  };
  const state = createBaseState({
    projects: [createProject("rescued-project", { automation: { enabled: true, batchSize: 1, concurrency: 1 } })],
    jobs: [staleJob]
  });

  const claim = claimAutomationDispatches(state, {
    now: Date.parse("2026-07-20T09:20:00.000Z"),
    staleBriefTimeoutMs: 15 * 60 * 1000
  });

  assert.equal(isStaleBriefPlaceholder(staleJob, Date.parse("2026-07-20T09:20:00.000Z"), 15 * 60 * 1000), true);
  assert.equal(claim.rescued, 1);
  assert.equal(claim.state.jobs[0].status, "failed");
  assert.equal(claim.dispatches.length, 1);
});

test("scheduler does not rescue fresh server-owned brief placeholders", () => {
  const state = createBaseState({
    projects: [createProject("fresh-project", { dailyLimit: 20, automation: { enabled: true, batchSize: 1, concurrency: 1 } })],
    jobs: [{
      id: "fresh-brief",
      serverBatchId: "batch-fresh",
      projectId: "fresh-project",
      status: "queued",
      stage: "brief",
      progress: 6,
      serverOwned: true,
      isBriefPlaceholder: true,
      briefStartedAt: "2026-07-20T09:10:00.000Z",
      queueStatus: ""
    }]
  });

  const claim = claimAutomationDispatches(state, {
    now: Date.parse("2026-07-20T09:20:00.000Z"),
    staleBriefTimeoutMs: 15 * 60 * 1000
  });

  assert.equal(claim.rescued, 0);
  assert.equal(claim.state.jobs[0].status, "queued");
  assert.equal(claim.dispatches.length, 0);
});

test("scheduler rescues legacy brief placeholders without started time", () => {
  const state = createBaseState({
    projects: [createProject("legacy-project", { automation: { enabled: true, batchSize: 1, concurrency: 1 } })],
    jobs: [{
      id: "legacy-brief",
      serverBatchId: "batch-legacy",
      projectId: "legacy-project",
      status: "queued",
      stage: "brief",
      progress: 6,
      isBriefPlaceholder: true,
      queueStatus: ""
    }]
  });

  const claim = claimAutomationDispatches(state, {
    now: Date.parse("2026-07-20T09:20:00.000Z"),
    staleBriefTimeoutMs: 15 * 60 * 1000
  });

  assert.equal(claim.rescued, 1);
  assert.equal(claim.state.jobs[0].status, "failed");
  assert.equal(claim.dispatches.length, 1);
});

test("scheduler rescues old queued brief jobs without placeholder flags", () => {
  const state = createBaseState({
    projects: [createProject("old-project", { automation: { enabled: true, batchSize: 1, concurrency: 1 } })],
    jobs: [{
      id: "old-brief",
      projectId: "old-project",
      status: "queued",
      stage: "brief",
      progress: 6,
      title: "Старый подготовленный сценарий",
      queueStatus: ""
    }]
  });

  const claim = claimAutomationDispatches(state, {
    now: Date.parse("2026-07-20T09:20:00.000Z"),
    staleBriefTimeoutMs: 15 * 60 * 1000
  });

  assert.equal(claim.rescued, 1);
  assert.equal(claim.state.jobs[0].status, "failed");
  assert.equal(claim.dispatches.length, 1);
});

test("automation selection stays inside the target project", () => {
  const state = createBaseState({
    selectedReferenceId: "ref-1",
    selectedCharacterId: "char-1",
    audioLibrary: [{ id: "audio-1", title: "Audio" }],
    selectedAudioId: "audio-1"
  });
  const project = createProject("project-2", {
    references: [{ id: "ref-2", enabled: true }],
    characters: [{ id: "char-2", name: "Other" }]
  });

  const selection = buildAutomationBatchSelection(state, project);

  assert.equal(selection.projectId, "project-2");
  assert.equal(selection.referenceId, "ref-2");
  assert.equal(selection.characterId, "__no_avatar__");
});

function createStateStore(initialState) {
  const store = { state: createBaseState(initialState) };
  store.updateGenerationState = async (updater) => {
    store.state = await updater(structuredClone(store.state));
    return { state: store.state, updatedAt: new Date().toISOString() };
  };
  return store;
}

function createBaseState(overrides = {}) {
  return {
    selectedProjectId: "",
    selectedReferenceId: "ref-global",
    selectedCharacterId: "",
    selectedAudioId: "audio-global",
    audioLibrary: [],
    freePrompt: "",
    projects: [],
    products: [],
    jobs: [],
    ...overrides
  };
}

function createProject(id, overrides = {}) {
  return {
    id,
    name: id,
    client: "",
    dailyLimit: 100,
    usedToday: 0,
    dailyUsageDate: getTodayDateString(),
    projectLimit: 500,
    usedTotal: 0,
    references: [{ id: "ref-global", title: "Reference", enabled: true }],
    characters: [],
    automation: { enabled: false, batchSize: 1, concurrency: 1, status: "idle", lastMessage: "", ...(overrides.automation || {}) },
    ...overrides
  };
}

function getTodayDateString() {
  return new Date().toISOString().slice(0, 10);
}

function getMiddayTodayMs() {
  return Date.parse(`${getTodayDateString()}T12:00:00.000Z`);
}
