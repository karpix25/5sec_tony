import test from "node:test";
import assert from "node:assert/strict";
import { createGenerationBatch } from "../scripts/generation-batch-runner.mjs";
import { generateServerAiBrief } from "../scripts/generation-brief-service.mjs";
import { projects, products } from "../src/domain/entities.js";

function createState() {
  const projectSource = projects[0];
  const project = {
    ...projectSource,
    references: projectSource.references.map((reference) => ({
      ...reference,
      designAnalysis: { formatType: "checklist_cards", layoutSlots: ["headline", "points"] }
    }))
  };
  const product = {
    ...products.find((item) => item.projectId === project.id),
    aiPassport: { productName: "Тестовый продукт", safeFacts: ["Можно описывать как продукт для теста"] }
  };
  return {
    projects: [project],
    products: [product],
    jobs: [],
    audioLibrary: [{ id: "audio-1", title: "Beat", fileData: "https://cdn.example.com/audio.mp3" }],
    hookLibrary: { activeVersionId: "", versions: [] },
    selectedProjectId: project.id,
    selectedProductId: product.id,
    selectedReferenceId: project.references[0].id,
    selectedCharacterId: "__no_avatar__",
    selectedAudioId: "audio-1",
    selectedProjectTab: "generation",
    generationBrief: {},
    freePrompt: ""
  };
}

function createStateDeps(initialState, extra = {}) {
  let state = initialState;
  const snapshots = [];
  return {
    ...extra,
    loadGenerationState: async () => state,
    updateGenerationState: async (updater) => {
      state = await updater(state);
      snapshots.push(structuredClone(state));
      return { state, updatedAt: "test-updated-at" };
    },
    getState: () => state,
    getSnapshots: () => snapshots
  };
}

test("backend generation batch creates server-owned brief jobs in state", async () => {
  const state = createState();
  const firstProduct = state.products[0];
  const selectedProduct = {
    ...products.find((item) => item.projectId === state.selectedProjectId && item.id !== firstProduct.id),
    aiPassport: { productName: "Выбранный продукт", safeFacts: ["Факт выбранного продукта"] }
  };
  state.products = [firstProduct, selectedProduct];
  state.selectedProductId = selectedProduct.id;
  const deps = createStateDeps(state, { autoStart: false });
  const result = await createGenerationBatch({
    count: 2,
    origin: "http://127.0.0.1:4173",
    selection: {
      projectId: deps.getState().selectedProjectId,
      productId: deps.getState().selectedProductId,
      referenceId: deps.getState().selectedReferenceId,
      characterId: deps.getState().selectedCharacterId,
      audioId: ""
    },
    deps
  });

  assert.match(result.batchId, /^batch-/);
  assert.equal(result.jobs.length, 2);
  assert.equal(result.state.selectedProjectTab, "queue");
  assert.equal(result.jobs.every((job) => job.serverOwned && job.serverBatchId === result.batchId), true);
  assert.equal(result.jobs.every((job) => job.generationSource === "manual"), true);
  assert.deepEqual(result.jobs.map((job) => [job.status, job.stage, job.isBriefPlaceholder]), [
    ["running", "brief", true],
    ["running", "brief", true]
  ]);
  assert.equal(result.jobs.every((job) => job.queueName === "generation-brief" && job.queueStatus === "queued"), true);
  assert.deepEqual(result.jobs.map((job) => job.productId), [selectedProduct.id, selectedProduct.id]);
  assert.deepEqual(result.jobs.map((job) => job.productName), [selectedProduct.name, selectedProduct.name]);
});

test("backend generation batch persists placeholders and enqueues brief jobs without running AI", async () => {
  const calls = [];
  const deps = createStateDeps(createState(), {
    enqueueBriefJob: async (job, metadata) => {
      calls.push({ jobId: job.id, batchId: metadata.batchId, origin: metadata.origin });
      return { mode: "bullmq", enqueued: true, jobId: `bull-${job.id}` };
    }
  });

  const result = await createGenerationBatch({
    count: 2,
    origin: "http://127.0.0.1:4173",
    selection: {
      projectId: deps.getState().selectedProjectId,
      productId: deps.getState().selectedProductId,
      referenceId: deps.getState().selectedReferenceId,
      characterId: deps.getState().selectedCharacterId,
      audioId: ""
    },
    deps
  });

  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map((item) => item.batchId), [result.batchId, result.batchId]);
  assert.equal(result.queue.length, 2);
  assert.equal(deps.getSnapshots().length, 1);
  assert.equal(deps.getState().jobs.every((job) => job.isBriefPlaceholder), true);
});

test("backend generation batch adopts client reservation ids", async () => {
  const state = createState();
  const deps = createStateDeps(state, { autoStart: false });
  const result = await createGenerationBatch({
    count: 2,
    origin: "http://127.0.0.1:4173",
    reservation: {
      batchId: "batch-reserved-1",
      jobIds: ["job-reserved-a", "job-reserved-b"]
    },
    selection: {
      projectId: state.selectedProjectId,
      productId: state.selectedProductId,
      referenceId: state.selectedReferenceId,
      characterId: state.selectedCharacterId,
      audioId: ""
    },
    deps
  });

  assert.equal(result.batchId, "batch-reserved-1");
  assert.deepEqual(result.jobs.map((job) => job.id), ["job-reserved-a", "job-reserved-b"]);
  assert.equal(result.jobs.every((job) => job.serverOwned && job.serverBatchId === "batch-reserved-1"), true);
  assert.equal(result.jobs.every((job) => job.generationSource === "manual"), true);
});

test("backend generation batch marks automation source", async () => {
  const state = createState();
  const deps = createStateDeps(state, { autoStart: false });
  const result = await createGenerationBatch({
    count: 1,
    source: "automation",
    origin: "http://127.0.0.1:4173",
    selection: {
      projectId: state.selectedProjectId,
      productId: "",
      referenceId: state.selectedReferenceId,
      characterId: state.selectedCharacterId,
      audioId: ""
    },
    deps
  });

  assert.equal(result.jobs[0].generationSource, "automation");
});

test("backend generation batch reports exact project limit exhaustion", async () => {
  const state = createState();
  state.projects = state.projects.map((project) => ({
    ...project,
    projectLimit: 1,
    usedTotal: 1
  }));
  const deps = createStateDeps(state, { autoStart: false });

  await assert.rejects(() => createGenerationBatch({
    count: 1,
    origin: "http://127.0.0.1:4173",
    selection: {
      projectId: state.selectedProjectId,
      productId: state.selectedProductId,
      referenceId: state.selectedReferenceId,
      characterId: state.selectedCharacterId,
      audioId: ""
    },
    deps
  }), (error) => {
    assert.equal(error.statusCode, 409);
    assert.match(error.message, /Лимит проекта исчерпан/);
    return true;
  });
});

test("backend generation batch distributes products only when explicitly requested", async () => {
  const state = createState();
  const firstProduct = state.products[0];
  const selectedProduct = {
    ...products.find((item) => item.projectId === state.selectedProjectId && item.id !== firstProduct.id),
    aiPassport: { productName: "Выбранный продукт", safeFacts: ["Факт выбранного продукта"] }
  };
  state.products = [firstProduct, selectedProduct];
  state.selectedProductId = selectedProduct.id;
  const deps = createStateDeps(state, { autoStart: false });

  const result = await createGenerationBatch({
    count: 2,
    distributeProducts: true,
    origin: "http://127.0.0.1:4173",
    selection: {
      projectId: state.selectedProjectId,
      productId: state.selectedProductId,
      referenceId: state.selectedReferenceId,
      characterId: state.selectedCharacterId,
      audioId: ""
    },
    deps
  });

  assert.deepEqual(result.jobs.map((job) => job.productId), [firstProduct.id, selectedProduct.id]);
});

test("backend generation batch enqueues quickly when audio preflight would fail", async () => {
  const state = { ...createState(), audioLibrary: [], selectedAudioId: "" };
  const deps = createStateDeps(state, { autoStart: false });

  const result = await createGenerationBatch({
    count: 1,
    origin: "http://127.0.0.1:4173",
    selection: {
      projectId: state.selectedProjectId,
      productId: state.selectedProductId,
      referenceId: state.selectedReferenceId,
      characterId: state.selectedCharacterId,
      audioId: ""
    },
    deps
  });

  assert.equal(result.jobs.length, 1);
  assert.equal(result.jobs[0].status, "running");
  assert.equal(result.jobs[0].stage, "brief");
  assert.equal(deps.getSnapshots().length, 1);
});

test("server brief generation accepts fallback after stale retry budget", async () => {
  const previousFetch = globalThis.fetch;
  const bodies = [];
  globalThis.fetch = async (_url, options) => {
    bodies.push(JSON.parse(options.body));
    return {
      ok: true,
      json: async () => ({
        draft: {
          topic: "Миф о волшебной таблетке",
          hook: "Волшебная таблетка не решает рутину сама"
        }
      })
    };
  };

  try {
    const state = createState();
    const brief = await generateServerAiBrief({
      origin: "http://127.0.0.1:4173",
      project: state.projects[0],
      product: state.products[0],
      reference: state.projects[0].references[0],
      existingJobs: [{ title: "Миф о волшебной таблетке", topic: "старый шаблон" }],
      hookLibrary: state.hookLibrary
    });

    assert.equal(brief.topic, "Миф о волшебной таблетке");
    assert.equal(brief.freshnessOverride.acceptedAfterRetries, true);
    assert.equal(brief.freshnessOverride.rejectedAttempts, 3);
    assert.equal(bodies.length, 3);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
