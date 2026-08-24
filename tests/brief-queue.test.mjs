import test from "node:test";
import assert from "node:assert/strict";
import { enqueueBriefJob, getBriefQueueName, startBriefQueueWorker } from "../scripts/brief-queue.mjs";
import { processBriefJob } from "../scripts/brief-job-processor.mjs";
import { projects, products } from "../src/domain/entities.js";

function createBullMqFake() {
  const jobs = new Map();
  const added = [];
  return {
    added,
    jobs,
    Queue: class FakeQueue {
      async getJob(id) {
        const existing = jobs.get(id);
        return existing ? {
          getState: async () => existing.state
        } : null;
      }

      async add(name, data, options) {
        added.push({ name, data, options });
        jobs.set(options.jobId, { state: "waiting" });
      }

      async close() {}
    },
    Worker: class FakeWorker {
      constructor(name, processor, options) {
        this.name = name;
        this.processor = processor;
        this.options = options;
      }

      async close() {}
    }
  };
}

function createState() {
  const project = {
    ...projects[0],
    references: projects[0].references.map((reference) => ({
      ...reference,
      designAnalysis: { formatType: "checklist_cards", layoutSlots: ["headline", "points"] }
    }))
  };
  const product = {
    ...products.find((item) => item.projectId === project.id),
    aiPassport: {
      version: "product-passport-v2",
      productName: "Тестовый продукт",
      safeFacts: ["Факт"],
      contentTerritory: {
        productWorld: "тестовая категория",
        directProductTopics: ["прямая тема"],
        adjacentHelpfulTopics: ["смежная тема"]
      }
    }
  };
  return {
    projects: [project],
    products: [product],
    jobs: [{
      id: "job-brief-test",
      projectId: project.id,
      productId: product.id,
      status: "running",
      stage: "brief",
      isBriefPlaceholder: true,
      serverBatchId: "batch-brief-test",
      serverOwned: true,
      generationSource: "manual",
      selectionSnapshot: {
        projectId: project.id,
        productId: product.id,
        referenceId: project.references[0].id,
        characterId: "__no_avatar__",
        audioId: ""
      },
      referenceId: project.references[0].id,
      queueName: "generation-brief",
      queueStatus: "queued",
      queueAttempts: 0,
      queueMaxAttempts: 3,
      createdAt: "2026-08-04T12:00:00.000Z",
      progress: 3
    }],
    audioLibrary: [{ id: "audio-1", title: "Beat", fileData: "https://cdn.example.com/audio.mp3" }],
    hookLibrary: { activeVersionId: "", versions: [] },
    selectedAudioId: "",
    selectedCharacterId: "__no_avatar__"
  };
}

function createStateDeps(initialState, extra = {}) {
  let state = initialState;
  return {
    ...extra,
    loadGenerationState: async () => state,
    updateGenerationState: async (updater) => {
      state = await updater(state);
      return { state, updatedAt: "test-updated-at" };
    },
    getState: () => state
  };
}

test("brief queue uses a stable BullMQ id and does not duplicate active jobs", async () => {
  const BullMQ = createBullMqFake();
  const env = { JOB_QUEUE_MODE: "bullmq", REDIS_URL: "redis://localhost:6379" };
  const job = { id: "job-brief-1", queueIdempotencyKey: "brief:batch-1:job-brief-1", queueMaxAttempts: 3 };

  const first = await enqueueBriefJob(job, { batchId: "batch-1", origin: "http://web" }, { env, BullMQ });
  const second = await enqueueBriefJob(job, { batchId: "batch-1", origin: "http://web" }, { env, BullMQ });

  assert.equal(getBriefQueueName(env), "generation-brief");
  assert.equal(first.enqueued, true);
  assert.equal(second.existing, true);
  assert.equal(BullMQ.added.length, 1);
  assert.equal(BullMQ.added[0].name, "prepare-generation-brief");
  assert.equal(BullMQ.added[0].data.jobId, job.id);
  assert.equal(BullMQ.added[0].options.jobId.includes(":"), false);
});

test("brief queue worker receives durable job payload through dependency injection", async () => {
  const BullMQ = createBullMqFake();
  const seen = [];
  const worker = await startBriefQueueWorker({
    env: { JOB_QUEUE_MODE: "bullmq", REDIS_URL: "redis://localhost:6379", BRIEF_QUEUE_CONCURRENCY: "2" },
    BullMQ,
    disableSignalHandlers: true,
    processBriefJob: async (payload) => seen.push(payload)
  });

  await worker.processor({
    data: { jobId: "job-brief-1", batchId: "batch-1", origin: "http://web" },
    attemptsMade: 1,
    opts: { attempts: 3 }
  });

  assert.equal(worker.name, "generation-brief");
  assert.equal(worker.options.concurrency, 2);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].jobId, "job-brief-1");
  assert.equal(seen[0].batchId, "batch-1");
  assert.equal(seen[0].origin, "http://web");
  assert.equal(seen[0].attemptsMade, 1);
  assert.equal(seen[0].maxAttempts, 3);
});

test("brief processor promotes a placeholder to a generation job", async () => {
  const state = createState();
  const calls = [];
  const deps = createStateDeps(state, {
    generateServerAiBrief: async () => ({
      topic: "Серверная тема",
      hook: "Серверный хук",
      aiPlan: { headline: "Серверный хук", subhead: "", points: ["Пункт"] }
    }),
    postServerJob: async ({ job }) => {
      calls.push(job);
      return { job };
    }
  });

  await processBriefJob({
    jobId: "job-brief-test",
    batchId: "batch-brief-test",
    origin: "http://127.0.0.1:4173",
    deps
  });

  const job = deps.getState().jobs[0];
  assert.equal(calls.length, 1);
  assert.equal(job.isBriefPlaceholder, undefined);
  assert.equal(job.queueName, "generation");
  assert.equal(job.queueStatus, "queued");
  assert.equal(job.queueIdempotencyKey, "generation:job-brief-test");
  assert.equal(job.title, "Серверный хук");

  await processBriefJob({ jobId: "job-brief-test", batchId: "batch-brief-test", origin: "http://127.0.0.1:4173", deps });
  assert.equal(calls.length, 1);
});

test("brief processor reloads full job data before retrying generation dispatch", async () => {
  const state = createState();
  state.jobs[0] = {
    ...state.jobs[0],
    isBriefPlaceholder: false,
    queueName: "generation",
    queueStatus: "queued",
    prompt: "Сохрани этот промпт",
    promptContract: { version: 1 },
    serverJobAcceptedAt: ""
  };
  const loads = [];
  let dispatchedJob = null;
  const deps = createStateDeps(state, {
    postServerJob: async ({ job }) => {
      dispatchedJob = job;
      return { ok: true };
    }
  });
  deps.loadGenerationState = async (options) => {
    loads.push(options);
    return state;
  };

  await processBriefJob({ jobId: state.jobs[0].id, origin: "http://127.0.0.1:4173", deps });

  assert.deepEqual(loads, [{ compactJobs: true }, undefined]);
  assert.equal(dispatchedJob.prompt, "Сохрани этот промпт");
  assert.deepEqual(dispatchedJob.promptContract, { version: 1 });
});

test("brief processor marks retryable and terminal failures explicitly", async () => {
  const state = createState();
  const deps = createStateDeps(state, {
    generateServerAiBrief: async () => { throw new Error("OpenRouter unavailable"); }
  });

  await assert.rejects(() => processBriefJob({ jobId: "job-brief-test", attemptsMade: 0, maxAttempts: 3, deps }), /OpenRouter unavailable/);
  assert.equal(deps.getState().jobs[0].queueStatus, "retrying");
  assert.equal(deps.getState().jobs[0].status, "running");

  await assert.rejects(() => processBriefJob({ jobId: "job-brief-test", attemptsMade: 2, maxAttempts: 3, deps }), /OpenRouter unavailable/);
  assert.equal(deps.getState().jobs[0].queueStatus, "failed");
  assert.equal(deps.getState().jobs[0].status, "failed");
  assert.equal(deps.getState().jobs[0].progress, 100);
});

test("brief processor retries dispatch after brief was persisted", async () => {
  const state = createState();
  let dispatchAttempts = 0;
  const deps = createStateDeps(state, {
    generateServerAiBrief: async () => ({
      topic: "Повторная тема",
      hook: "Повторный хук",
      aiPlan: { headline: "Повторный хук", subhead: "", points: ["Пункт"] }
    }),
    postServerJob: async () => {
      dispatchAttempts += 1;
      if (dispatchAttempts === 1) throw new Error("web временно недоступен");
      return { ok: true };
    }
  });

  await assert.rejects(() => processBriefJob({
    jobId: "job-brief-test",
    batchId: "batch-brief-test",
    origin: "http://127.0.0.1:4173",
    attemptsMade: 0,
    maxAttempts: 3,
    deps
  }), /временно недоступен/);
  assert.equal(deps.getState().jobs[0].queueStatus, "retrying");

  await processBriefJob({
    jobId: "job-brief-test",
    batchId: "batch-brief-test",
    origin: "http://127.0.0.1:4173",
    attemptsMade: 1,
    maxAttempts: 3,
    deps
  });
  assert.equal(dispatchAttempts, 2);
  assert.ok(deps.getState().jobs[0].serverJobAcceptedAt);
});
