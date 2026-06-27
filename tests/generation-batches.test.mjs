import test from "node:test";
import assert from "node:assert/strict";
import { createGenerationBatch } from "../scripts/generation-batch-runner.mjs";
import { generateServerAiBrief } from "../scripts/generation-brief-service.mjs";
import { projects, products } from "../src/domain/entities.js";

function createState() {
  const project = projects[0];
  const product = products.find((item) => item.projectId === project.id);
  return {
    projects: [project],
    products: [product],
    jobs: [],
    audioLibrary: [],
    hookLibrary: { activeVersionId: "", versions: [] },
    selectedProjectId: project.id,
    selectedProductId: product.id,
    selectedReferenceId: project.references[0].id,
    selectedCharacterId: "__no_avatar__",
    selectedAudioId: "",
    selectedProjectTab: "generation",
    generationBrief: {},
    freePrompt: ""
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
      { id: "ref-a", type: "design", title: "A" },
      { id: "ref-b", type: "design", title: "B" }
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
