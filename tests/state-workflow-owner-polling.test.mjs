import test from "node:test";
import assert from "node:assert/strict";
import { createAvatarWorkflow } from "../src/state/avatar-workflow.js";
import { createDesignReferenceWorkflow } from "../src/state/design-reference-workflow.js";
import { createAvatarVideoWorkflow } from "../src/state/avatar-video-workflow.js";

test("avatar polling resumes against candidate owner project instead of selected project", async () => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  const state = {
    selectedProjectId: "project-b",
    projects: [
      {
        id: "project-a",
        avatarCandidates: [{ id: "candidate-a", taskId: "task-a", status: "waiting", imageData: "", imageUrl: "", failMsg: "" }],
        characters: [{ id: "char-a", avatarVideos: [] }]
      },
      { id: "project-b", avatarCandidates: [], characters: [{ id: "char-b", avatarVideos: [] }] }
    ]
  };
  const workflow = createAvatarWorkflow({
    getState: () => state,
    setState: (patch) => Object.assign(state, patch),
    getProject: (source, projectId) => source.projects.find((item) => item.id === projectId)
  });

  globalThis.setTimeout = (callback) => originalSetTimeout(callback, 0);
  globalThis.fetch = async (url) => {
    assert.match(String(url), /task-a/);
    return { ok: true, json: async () => ({ state: "success", imageUrl: "https://cdn.example.com/avatar.png" }) };
  };

  try {
    workflow.resumeAvatarPolling();
    await waitFor(() => state.projects[0].avatarCandidates[0].status === "review");

    assert.equal(state.projects[0].avatarCandidates[0].imageData, "https://cdn.example.com/avatar.png");
    assert.equal(state.projects[1].avatarCandidates.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
  }
});

test("design reference polling resumes against candidate owner project instead of selected project", async () => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  const state = {
    selectedProjectId: "project-b",
    projects: [
      {
        id: "project-a",
        designReferenceCandidates: [{ id: "design-a", taskId: "task-design", status: "waiting", imageData: "", imageUrl: "", failMsg: "" }],
        characters: [{ id: "char-a", avatarVideos: [] }]
      },
      { id: "project-b", designReferenceCandidates: [], characters: [{ id: "char-b", avatarVideos: [] }] }
    ]
  };
  const workflow = createDesignReferenceWorkflow({
    getState: () => state,
    setState: (patch) => Object.assign(state, patch),
    getProject: (source, projectId) => source.projects.find((item) => item.id === projectId)
  });

  globalThis.setTimeout = (callback) => originalSetTimeout(callback, 0);
  globalThis.fetch = async (url) => {
    assert.match(String(url), /task-design/);
    return { ok: true, json: async () => ({ state: "success", imageUrl: "https://cdn.example.com/design.png" }) };
  };

  try {
    workflow.resumeDesignReferencePolling();
    await waitFor(() => state.projects[0].designReferenceCandidates[0].status === "review");

    assert.equal(state.projects[0].designReferenceCandidates[0].imageData, "https://cdn.example.com/design.png");
    assert.equal(state.projects[1].designReferenceCandidates.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
  }
});

test("avatar video polling resumes against character owner project instead of selected project", async () => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  const state = {
    selectedProjectId: "project-b",
    projects: [
      {
        id: "project-a",
        characters: [{
          id: "char-a",
          avatarVideos: [{ id: "video-a", taskId: "task-video", status: "waiting", videoUrl: "", failMsg: "", alphaStatus: "idle" }]
        }]
      },
      { id: "project-b", characters: [{ id: "char-b", avatarVideos: [] }] }
    ]
  };
  const workflow = createAvatarVideoWorkflow({
    getState: () => state,
    getProject: (source, projectId) => source.projects.find((item) => item.id === projectId),
    patchCharacter: (characterId, updater) => {
      state.projects = state.projects.map((project) => ({
        ...project,
        characters: project.characters.map((character) => character.id === characterId ? updater(character) : character)
      }));
    },
    addProjectAvatarVideo: () => {}
  });

  globalThis.setTimeout = (callback) => originalSetTimeout(callback, 0);
  globalThis.fetch = async (url) => {
    assert.match(String(url), /task-video/);
    return { ok: true, json: async () => ({ state: "success", videoUrl: "https://cdn.example.com/avatar-video.mp4" }) };
  };

  try {
    workflow.resumeAvatarVideoPolling();
    await waitFor(() => state.projects[0].characters[0].avatarVideos[0].status === "ready");

    assert.equal(state.projects[0].characters[0].avatarVideos[0].videoUrl, "https://cdn.example.com/avatar-video.mp4");
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
  }
});

async function waitFor(predicate) {
  for (let index = 0; index < 25; index += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("condition was not met");
}
