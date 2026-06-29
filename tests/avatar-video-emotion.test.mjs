import test from "node:test";
import assert from "node:assert/strict";
import { createAvatarVideoRecord } from "../src/domain/avatar-video.js";
import { createStore } from "../src/state/store.js";

test("avatar video defaults to an editable emotional name", () => {
  const video = createAvatarVideoRecord({ name: "Overlay Avatar" });

  assert.equal(video.name, "Overlay Avatar · спокойная экспертность");
});

test("avatar video accepts custom emotional name", () => {
  const video = createAvatarVideoRecord({ name: "Олеся" }, {
    name: "тревожное предупреждение"
  });

  assert.equal(video.name, "тревожное предупреждение");
});

test("store updates avatar video emotional name", () => {
  const store = createStore();
  const state = store.getState();
  const project = state.projects.find((item) => item.id === state.selectedProjectId);
  const video = {
    id: "avatar-video-name-test",
    name: "старое название",
    status: "ready",
    videoUrl: "https://cdn.example.com/avatar-green.mp4",
    isActive: true
  };
  state.projects = state.projects.map((item) =>
    item.id === project.id
      ? { ...item, characters: [{ ...item.characters[0], avatarVideos: [video] }] }
      : item
  );

  store.updateAvatarVideoName(video.id, "дружелюбный совет");

  const updatedProject = store.getState().projects.find((item) => item.id === project.id);
  assert.equal(updatedProject.characters[0].avatarVideos[0].name, "дружелюбный совет");
});
