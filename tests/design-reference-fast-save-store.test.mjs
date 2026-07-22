import test from "node:test";
import assert from "node:assert/strict";
import { createInitialState } from "../src/state/initial-state.js";
import { createStore } from "../src/state/store.js";

test("frontend seed no longer exposes the old English PPM design reference title", () => {
  assert.equal(JSON.stringify(createInitialState()).includes("Viral symptoms poster"), false);
});

test("remote design reference create skips full state save and refreshes baseUpdatedAt", async () => {
  const { calls, restore } = installFetch((url, options = {}) => {
    if (isStateGet(url, options)) return jsonResponse({ state: createInitialState(), updatedAt: "t0" });
    if (url === "/api/projects/supplements/design-references") {
      const reference = JSON.parse(options.body).reference;
      return jsonResponse({ saved: true, reference: { ...reference, title: "Серверный реф" }, project: withSelectedProject(createInitialState(), { references: [{ ...reference, title: "Серверный реф" }] }).projects.find((item) => item.id === "supplements"), updatedAt: "t1" });
    }
    if (isStatePost(url, options)) return jsonResponse({ error: "full state save should not be used" }, 500);
    return jsonResponse({ error: `unexpected ${url}` }, 500);
  });

  try {
    const store = createStore();
    await store.whenHydrated();
    calls.length = 0;

    await store.createReference({ title: "Русский реф", imageData: "https://cdn.example.com/ref.png" });
    await wait(320);

    const state = store.getState();
    const project = state.projects.find((item) => item.id === state.selectedProjectId);
    assert.equal(project.references[0].title, "Серверный реф");
    assert.equal(calls.filter((call) => isStatePost(call.url, call.options)).length, 0);
    assert.equal(JSON.parse(calls[0].options.body).baseUpdatedAt, "t0");
  } finally {
    restore();
  }
});

test("remote design reference update falls back to full state save when endpoint is missing", async () => {
  const remoteState = createInitialState();
  const { calls, restore } = installFetch((url, options = {}) => {
    if (isStateGet(url, options)) return jsonResponse({ state: remoteState, updatedAt: "t0" });
    if (String(url).includes("/design-references/")) return jsonResponse({ error: "not found" }, 404);
    if (isStatePost(url, options)) return jsonResponse({ saved: true, updatedAt: "t1" });
    return jsonResponse({ error: `unexpected ${url}` }, 500);
  });

  try {
    const store = createStore();
    await store.whenHydrated();
    calls.length = 0;

    await store.updateSelectedDesignReference({ title: "Новый русский референс" });
    await wait(360);

    const stateSaves = calls.filter((call) => isStatePost(call.url, call.options));
    const savedState = JSON.parse(stateSaves[0].options.body).state;
    const savedProject = savedState.projects.find((project) => project.id === remoteState.selectedProjectId);
    assert.equal(stateSaves.length, 1);
    assert.equal(savedProject.references[0].title, "Новый русский референс");
  } finally {
    restore();
  }
});

test("approve and reject design reference candidates use project-scoped endpoints", async () => {
  const candidateOne = {
    id: "candidate-1",
    status: "review",
    title: "Сгенерированный шаблон",
    fontStyle: "bold sans",
    imageData: "https://cdn.example.com/generated.png",
    createdAt: "2026-07-22T10:00:00.000Z"
  };
  const candidateTwo = { ...candidateOne, id: "candidate-2", title: "Второй шаблон" };
  const remoteState = withSelectedProject(createInitialState(), {
    designReferenceCandidates: [candidateOne, candidateTwo]
  });
  const { calls, restore } = installFetch((url, options = {}) => {
    if (isStateGet(url, options)) return jsonResponse({ state: remoteState, updatedAt: "t0" });
    if (url === "/api/projects/supplements/design-reference-candidates/candidate-1/approve") {
      return jsonResponse({ saved: true, reference: { id: "server-ref", title: "Сгенерированный шаблон", imageData: candidateOne.imageData }, project: withSelectedProject(remoteState, { references: [{ id: "server-ref", title: "Сгенерированный шаблон", imageData: candidateOne.imageData }], designReferenceCandidates: [candidateTwo] }).projects.find((item) => item.id === "supplements"), updatedAt: "t1" });
    }
    if (url === "/api/projects/supplements/design-reference-candidates/candidate-2/reject") {
      return jsonResponse({ saved: true, rejectedCandidateId: "candidate-2", project: withSelectedProject(remoteState, { designReferenceCandidates: [] }).projects.find((item) => item.id === "supplements"), updatedAt: "t2" });
    }
    if (isStatePost(url, options)) return jsonResponse({ error: "full state save should not be used" }, 500);
    return jsonResponse({ error: `unexpected ${url}` }, 500);
  });

  try {
    const store = createStore();
    await store.whenHydrated();
    calls.length = 0;

    await store.approveDesignReference("candidate-1");
    assert.equal(store.getState().selectedReferenceId, "server-ref");
    assert.equal(calls.some((call) => call.url.endsWith("/approve")), true);

    await store.rejectDesignReference("candidate-2");
    await wait(360);

    assert.equal(calls.filter((call) => call.url.endsWith("/reject")).length, 1);
    assert.equal(calls.filter((call) => isStatePost(call.url, call.options)).length, 0);
  } finally {
    restore();
  }
});

function installFetch(handler) {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    return handler(url, options);
  };
  return {
    calls,
    restore: () => {
      globalThis.fetch = originalFetch;
    }
  };
}

function withSelectedProject(state, patch) {
  return {
    ...state,
    projects: state.projects.map((project) =>
      project.id === state.selectedProjectId ? { ...project, ...patch } : project
    )
  };
}

function isStateGet(url, options = {}) {
  return url === "/api/state" && (!options.method || options.method === "GET");
}

function isStatePost(url, options = {}) {
  return url === "/api/state" && options.method === "POST";
}

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
