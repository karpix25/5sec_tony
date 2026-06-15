import test from "node:test";
import assert from "node:assert/strict";
import { updateAvatarCandidate } from "../src/domain/avatar.js";
import { createStore } from "../src/state/store.js";

test("store reviews Kie.ai avatar candidates and stores approved avatar with s3 key", async () => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (callback) => originalSetTimeout(callback, 0);
  globalThis.fetch = async (url) => ({
    ok: true,
    json: async () => String(url).includes("/api/avatars/status")
      ? { state: "success", imageUrl: "https://cdn.example.com/avatar.png" }
      : { taskId: "task_gptimage_test" }
  });
  const store = createStore();

  try {
    await store.createCharacter({ name: "QA Avatar", prompt: "friendly expert, clean background" });
    let project = getSelectedProject(store);
    const rejected = project.avatarCandidates.find((item) => item.name === "QA Avatar");

    assert.equal(rejected.provider, "kie.ai");
    await waitFor(() => getSelectedProject(store).avatarCandidates.find((item) => item.id === rejected.id)?.status === "review");
    project = getSelectedProject(store);
    const reviewed = project.avatarCandidates.find((item) => item.id === rejected.id);
    assert.equal(reviewed.provider, "kie.ai");
    assert.equal(reviewed.status, "review");
    assert.equal(rejected.taskId, "task_gptimage_test");
    assert.match(rejected.finalPrompt, /vertical 9:16 photorealistic portrait/);
    assert.match(rejected.finalPrompt, /chroma key green background \(#00FF00\)/);
    assert.match(rejected.finalPrompt, /Avoid illustration, cartoon, CGI/);

    store.rejectAvatar(rejected.id);
    project = getSelectedProject(store);
    assert.equal(project.avatarCandidates.some((item) => item.id === rejected.id), false);

    await store.createCharacter({ name: "Approved Avatar", prompt: "consistent portrait for infographics" });
    project = getSelectedProject(store);
    const candidate = project.avatarCandidates.find((item) => item.name === "Approved Avatar");
    await waitFor(() => getSelectedProject(store).avatarCandidates.find((item) => item.id === candidate.id)?.status === "review");
    store.approveAvatar(candidate.id);

    project = getSelectedProject(store);
    const approved = project.characters.find((item) => item.name === "Approved Avatar");
    assert.equal(project.avatarCandidates.some((item) => item.id === candidate.id), false);
    assert.equal(approved.status, "approved");
    assert.equal(approved.provider, "kie.ai");
    assert.match(approved.s3Key, /^s3:\/\/anton-5-sec\/projects\//);
    assert.equal(approved.imageData, "https://cdn.example.com/avatar.png");
    assert.equal(store.getState().selectedCharacterId, approved.id);

    store.deleteCharacter(approved.id);
    project = getSelectedProject(store);
    assert.equal(project.characters.some((item) => item.id === approved.id), false);

    const lastAvatarId = project.characters[0].id;
    store.deleteCharacter(lastAvatarId);
    project = getSelectedProject(store);
    assert.equal(project.characters.length, 1);
    assert.equal(project.characters[0].id, lastAvatarId);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
  }
});

test("avatar status treats completed Kie.ai response as ready for review", () => {
  const updated = updateAvatarCandidate({ id: "candidate-1", status: "generating", imageData: "", imageUrl: "", failMsg: "" }, {
    state: "completed",
    imageUrl: "https://cdn.example.com/avatar-completed.png"
  });

  assert.equal(updated.status, "review");
  assert.equal(updated.imageData, "https://cdn.example.com/avatar-completed.png");
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
