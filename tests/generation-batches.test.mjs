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
  const deps = createStateDeps(createState(), { autoStart: false });
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
  assert.deepEqual(result.jobs.map((job) => [job.status, job.stage, job.isBriefPlaceholder]), [
    ["running", "brief", true],
    ["running", "brief", true]
  ]);
});

test("backend generation preflight blocks jobs when no audio is uploaded", async () => {
  const state = { ...createState(), audioLibrary: [], selectedAudioId: "" };
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
  }), /Сначала загрузите аудио/);

  assert.equal(deps.getSnapshots().length, 0);
});

test("backend generation preflight saves product cards and design analysis before queue jobs", async () => {
  const state = createState();
  const secondProduct = {
    ...products.find((item) => item.projectId === state.selectedProjectId && item.id !== state.selectedProductId),
    aiPassport: null
  };
  state.products = [{ ...state.products[0], aiPassport: null }, secondProduct];
  state.projects = [{
    ...state.projects[0],
    references: state.projects[0].references.map((reference) => ({ ...reference, designAnalysis: null }))
  }];
  const calls = [];
  const deps = createStateDeps(state, {
    autoStart: false,
    refreshProductPassport: async ({ product }) => {
      calls.push(["passport", product.id]);
      return { productName: product.name, safeFacts: [`Факт ${product.id}`] };
    },
    refreshDesignAnalysis: async ({ reference }) => {
      calls.push(["design", reference.id]);
      return { formatType: "symptom_poster", layoutSlots: ["headline", "cards"] };
    }
  });

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
  const snapshots = deps.getSnapshots();
  const preflightSnapshot = snapshots[0];
  const queueSnapshot = snapshots[1];

  assert.deepEqual(calls, [
    ["passport", state.products[0].id],
    ["passport", secondProduct.id],
    ["design", state.selectedReferenceId]
  ]);
  assert.equal(result.jobs.length, 1);
  assert.equal(preflightSnapshot.jobs.length, 0);
  assert.equal(preflightSnapshot.products.every((product) => product.aiPassport?.productName), true);
  assert.equal(preflightSnapshot.projects[0].references[0].designAnalysis.formatType, "symptom_poster");
  assert.equal(queueSnapshot.jobs.length, 1);
});

test("backend generation preflight failure prevents queue jobs", async () => {
  const state = createState();
  state.products = state.products.map((product) => ({ ...product, aiPassport: null }));
  const deps = createStateDeps(state, {
    autoStart: false,
    refreshProductPassport: async () => {
      throw new Error("passport provider failed");
    }
  });

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
  }), /passport provider failed/);
  assert.equal(deps.getState().jobs.length, 0);
  assert.equal(deps.getSnapshots().length, 0);
});

test("backend generation worker prepares brief and hands job to server pipeline", async () => {
  const calls = [];
  const deps = createStateDeps(createState(), {
    generateServerAiBrief: async ({ product, existingJobs }) => {
      calls.push(["brief", product.id, existingJobs.length]);
      return {
        topic: "Серверная тема",
        hook: "Серверный хук",
        aiPlan: { headline: "Серверный хук", subhead: "", points: ["Пункт"] }
      };
    },
    postServerJob: async ({ job, context }) => {
      calls.push(["serverJob", job.id, job.title, job.status, job.stage, context.project.id]);
      return { job: { ...job, status: "running", stage: "image" } };
    }
  });

  const result = await createGenerationBatch({
    count: 1,
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
  await waitFor(() => calls.some((call) => call[0] === "serverJob"));

  const job = deps.getState().jobs.find((item) => item.id === result.jobs[0].id);
  assert.equal(job.isBriefPlaceholder, undefined);
  assert.equal(job.serverOwned, true);
  assert.equal(job.title, "Серверный хук");
  assert.deepEqual(calls, [
    ["brief", deps.getState().selectedProductId, 0],
    ["serverJob", job.id, "Серверный хук", "queued", "brief", deps.getState().selectedProjectId]
  ]);
});

test("backend generation worker keeps rotated placeholder design reference", async () => {
  const state = createState();
  state.projects = [{
    ...state.projects[0],
    references: [
      { id: "ref-a", type: "design", title: "A", designAnalysis: { formatType: "checklist_cards" } },
      { id: "ref-b", type: "design", title: "B", designAnalysis: { formatType: "checklist_cards" } }
    ]
  }];
  state.selectedReferenceId = "ref-a";
  const referencesSeen = [];
  const deps = createStateDeps(state, {
    generateServerAiBrief: async ({ reference }) => {
      referencesSeen.push(reference.id);
      return { topic: "Тема", hook: "Хук", aiPlan: { headline: "Хук", subhead: "", points: ["Пункт"] } };
    },
    postServerJob: async ({ job }) => ({ job })
  });

  const result = await createGenerationBatch({
    count: 2,
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
  await waitFor(() => referencesSeen.length === result.jobs.length);

  assert.deepEqual(result.jobs.map((job) => job.referenceId), ["ref-a", "ref-b"]);
  assert.deepEqual(referencesSeen, ["ref-a", "ref-b"]);
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

async function waitFor(predicate) {
  for (let index = 0; index < 20; index += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.fail("condition was not met");
}
