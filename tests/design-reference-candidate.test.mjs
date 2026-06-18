import test from "node:test";
import assert from "node:assert/strict";
import {
  approveDesignReferenceCandidate,
  createDesignReferenceCandidate,
  updateDesignReferenceCandidate
} from "../src/domain/design-reference-candidate.js";
import { createStore } from "../src/state/store.js";

test("design reference candidate prompt creates a safe reusable template", () => {
  const candidate = createDesignReferenceCandidate({ name: "Проект", projectTheme: "финтех" }, {
    title: "Glow cards",
    fontStyle: "bold sans",
    takeaways: "розовый хук и карточки"
  });

  assert.match(candidate.finalPrompt, /vertical 9:16 design reference template/);
  assert.match(candidate.finalPrompt, /Visible text may only be short neutral Russian placeholders/);
  assert.match(candidate.finalPrompt, /Do not show product packaging, avatar/);
  assert.match(candidate.finalPrompt, /x=72\.\.820 and y=190\.\.1360/);
  assert.equal(candidate.isActive, undefined);
});

test("design reference status becomes review when image is ready", () => {
  const updated = updateDesignReferenceCandidate({ id: "candidate", status: "generating" }, {
    state: "success",
    imageUrl: "https://cdn.example.com/design.png"
  });

  assert.equal(updated.status, "review");
  assert.equal(updated.imageData, "https://cdn.example.com/design.png");
});

test("approved design reference candidate becomes library reference", () => {
  const reference = approveDesignReferenceCandidate({
    title: "Approved template",
    fontStyle: "bold sans",
    takeaways: "cards",
    imageData: "https://cdn.example.com/design.png",
    createdAt: "2026-06-16T00:00:00.000Z"
  });

  assert.equal(reference.type, "design");
  assert.equal(reference.title, "Approved template");
  assert.equal(reference.fontStyle, "bold sans");
  assert.equal(reference.imageData, "https://cdn.example.com/design.png");
});

test("store reviews and approves generated design reference templates", async () => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (callback) => originalSetTimeout(callback, 0);
  globalThis.fetch = async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : {};
    if (String(url).includes("/api/images/generate")) {
      assert.match(body.prompt, /design reference template/);
      assert.equal(body.provider, "gpt-image-2");
      return { ok: true, json: async () => ({ taskId: "design-template-task" }) };
    }
    if (String(url).includes("/api/images/status")) {
      return { ok: true, json: async () => ({ state: "success", imageUrl: "https://cdn.example.com/generated-design.png" }) };
    }
    return { ok: true, json: async () => ({}) };
  };

  try {
    const store = createStore();
    const project = getSelectedProject(store);
    const initialReferenceCount = project.references.length;

    await store.createDesignReferenceTemplate({
      title: "Generated design",
      fontStyle: "bold sans",
      takeaways: "cards and safe zone"
    });
    await waitFor(() => getSelectedProject(store).designReferenceCandidates?.[0]?.status === "review");

    const candidate = getSelectedProject(store).designReferenceCandidates[0];
    assert.equal(candidate.imageData, "https://cdn.example.com/generated-design.png");

    store.approveDesignReference(candidate.id);
    const updated = getSelectedProject(store);
    assert.equal(updated.designReferenceCandidates.length, 0);
    assert.equal(updated.references.length, initialReferenceCount + 1);
    assert.equal(updated.references[0].title, "Generated design");
    assert.equal(store.getState().selectedReferenceId, updated.references[0].id);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
  }
});

test("store deletes selected design reference and selects the next one", () => {
  const store = createStore();
  store.createReference({ title: "Delete me", prompt: "dark cards" });
  const state = store.getState();
  const project = getSelectedProject(store);
  const deletedId = state.selectedReferenceId;

  store.deleteReference(deletedId);

  const updated = getSelectedProject(store);
  assert.equal(updated.references.some((reference) => reference.id === deletedId), false);
  assert.equal(store.getState().selectedReferenceId, updated.references[0].id);
});

function getSelectedProject(store) {
  const state = store.getState();
  return state.projects.find((item) => item.id === state.selectedProjectId);
}

async function waitFor(predicate) {
  for (let index = 0; index < 20; index += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("condition was not met");
}
