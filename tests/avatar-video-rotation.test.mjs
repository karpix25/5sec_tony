import test from "node:test";
import assert from "node:assert/strict";
import { pickAvatarVideoRoundRobin } from "../src/domain/avatar-video-rotation.js";

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
