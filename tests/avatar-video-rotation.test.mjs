import test from "node:test";
import assert from "node:assert/strict";
import { pickAvatarVideoRoundRobin } from "../src/domain/avatar-video-rotation.js";
import { resolveAvatarEmotionSelection } from "../src/domain/avatar-emotion.js";

test("avatar video rotation prioritizes selected character with ready video", () => {
  const project = {
    avatarRoundRobinIndex: 0,
    characters: [{
      id: "first-char",
      isActive: true,
      avatarVideos: [
        { id: "first-video", status: "ready", videoUrl: "https://cdn.example.com/first.mp4", isActive: true }
      ]
    }, {
      id: "second-char",
      isActive: true,
      avatarVideos: [
        { id: "second-video", status: "ready", videoUrl: "https://cdn.example.com/second.mp4", isActive: true }
      ]
    }]
  };

  const pick = pickAvatarVideoRoundRobin(project, "second-char");

  assert.equal(pick.characterId, "second-char");
  assert.equal(pick.video.id, "second-video");
});

test("avatar video rotation can target a named emotion video", () => {
  const project = {
    avatarRoundRobinIndex: 0,
    characters: [{
      id: "char-1",
      isActive: true,
      avatarVideos: [
        { id: "calm", name: "спокойная экспертность", status: "ready", alphaVideoUrl: "https://cdn.example.com/calm.webm", isActive: true },
        { id: "warning", name: "тревожное предупреждение", status: "ready", alphaVideoUrl: "https://cdn.example.com/warning.webm", isActive: true }
      ]
    }]
  };

  const pick = pickAvatarVideoRoundRobin(project, "char-1", { emotionName: "тревожное предупреждение" });

  assert.equal(pick.characterId, "char-1");
  assert.equal(pick.video.id, "warning");
});

test("avatar emotion selection exposes only existing ready avatar video names", () => {
  const project = {
    characters: [{
      id: "char-1",
      name: "Олеся",
      isActive: true,
      avatarVideos: [
        { id: "warning", name: "тревожное предупреждение", status: "ready", alphaVideoUrl: "https://cdn.example.com/warning.webm", isActive: true },
        { id: "draft", name: "радость", status: "waiting", alphaVideoUrl: "https://cdn.example.com/draft.webm", isActive: true }
      ]
    }]
  };

  const selection = resolveAvatarEmotionSelection({
    project,
    topic: "3 ошибки перед покупкой",
    hook: "туристическая ловушка",
    brief: { avatarEmotionName: "придуманная эмоция" },
    selectedCharacterId: "char-1"
  });

  assert.deepEqual(selection.availableAvatarEmotions.map((item) => item.emotionName), ["тревожное предупреждение"]);
  assert.equal(selection.avatarVideoId, "warning");
  assert.equal(selection.avatarEmotionName, "тревожное предупреждение");
});
