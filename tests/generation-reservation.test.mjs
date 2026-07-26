import test from "node:test";
import assert from "node:assert/strict";
import { projects, products } from "../src/domain/entities.js";
import { createJobActions } from "../src/state/job-actions.js";

test("server generation reservation creates visible failed job when project limit is exhausted", () => {
  const sourceProject = projects[0];
  const project = {
    ...sourceProject,
    usedToday: 0,
    dailyLimit: 10,
    usedTotal: 5,
    projectLimit: 5
  };
  const product = products.find((item) => item.projectId === project.id);
  let state = {
    projects: [project],
    products: [product],
    jobs: [],
    selectedProjectId: project.id,
    selectedProductId: product.id,
    selectedReferenceId: project.references[0].id,
    selectedCharacterId: "__no_avatar__",
    selectedAudioId: "",
    audioLibrary: [],
    hookLibrary: {},
    generationBrief: {},
    freePrompt: ""
  };
  const setStateOptions = [];
  const actions = createJobActions({
    getState: () => state,
    setState: (patch, options = {}) => {
      setStateOptions.push(options);
      state = { ...state, ...patch };
    },
    getProject: (_state, projectId) => state.projects.find((item) => item.id === projectId) || state.projects[0]
  });

  const result = actions.createPendingServerGenerationBatch({
    count: 1,
    selection: {
      projectId: project.id,
      productId: product.id,
      referenceId: project.references[0].id
    }
  });

  assert.equal(result.accepted, false);
  assert.equal(state.selectedProjectTab, "queue");
  assert.equal(state.jobs.length, 1);
  assert.equal(state.jobs[0].status, "failed");
  assert.equal(state.jobs[0].stage, "brief");
  assert.equal(state.jobs[0].title, "Запуск не принят");
  assert.match(state.jobs[0].failMsg, /Лимит проекта исчерпан/);
  assert.equal(setStateOptions.at(-1)?.skipRemoteSave, true);
});

test("server generation reservation uses selection snapshot reference", () => {
  const sourceProject = projects[0];
  const project = {
    ...sourceProject,
    references: [
      { ...sourceProject.references[0], id: "ref-pink", title: "розовый стиль" },
      { ...sourceProject.references[0], id: "ref-funnel", title: "Воронка" }
    ],
    usedToday: 0,
    dailyLimit: 10,
    usedTotal: 0,
    projectLimit: 10
  };
  const product = products.find((item) => item.projectId === project.id);
  let state = {
    projects: [project],
    products: [product],
    jobs: [],
    selectedProjectId: project.id,
    selectedProductId: product.id,
    selectedReferenceId: "ref-pink",
    selectedCharacterId: "__no_avatar__",
    selectedAudioId: "",
    audioLibrary: [],
    hookLibrary: {},
    generationBrief: {},
    freePrompt: ""
  };
  const setStateOptions = [];
  const actions = createJobActions({
    getState: () => state,
    setState: (patch, options = {}) => {
      setStateOptions.push(options);
      state = { ...state, ...patch };
    },
    getProject: (_state, projectId) => state.projects.find((item) => item.id === projectId) || state.projects[0]
  });

  const result = actions.createPendingServerGenerationBatch({
    count: 1,
    selection: {
      projectId: project.id,
      productId: product.id,
      referenceId: "ref-funnel"
    }
  });

  assert.equal(result.accepted, true);
  assert.equal(state.jobs[0].referenceId, "ref-funnel");
  assert.equal(state.jobs[0].referenceTitle, "Воронка");
  assert.equal(setStateOptions.at(-1)?.skipRemoteSave, true);
});

test("server job merges are UI-only and do not schedule full state save", () => {
  let state = {
    projects: [],
    products: [],
    jobs: [{ id: "job-local", status: "running" }]
  };
  const setStateOptions = [];
  const actions = createJobActions({
    getState: () => state,
    setState: (patch, options = {}) => {
      setStateOptions.push(options);
      state = { ...state, ...patch };
    },
    getProject: () => ({ id: "project" })
  });

  const merged = actions.mergeServerJobs([{ id: "job-local", status: "done" }]);
  actions.failPendingGenerationBatch("missing-batch", "ignored");

  assert.equal(merged.length, 1);
  assert.equal(state.jobs[0].status, "done");
  assert.equal(setStateOptions[0]?.skipRemoteSave, true);
  assert.equal(setStateOptions[1]?.skipRemoteSave, true);
});
