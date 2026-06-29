import test from "node:test";
import assert from "node:assert/strict";
import { pickAvatarVideoRoundRobin } from "../src/domain/avatar-video-rotation.js";
import { createStore } from "../src/state/store.js";

test("store keeps bottom avatar overlay preset values", () => {
  const store = createStore();
  const state = store.getState();
  const project = getSelectedProject(store);
  const video = {
    id: "avatar-video-overlay-test",
    status: "ready",
    videoUrl: "https://cdn.example.com/avatar-green.mp4",
    overlay: { x: 50, y: 70, scale: 100, opacity: 100 }
  };
  state.projects = state.projects.map((item) =>
    item.id === project.id
      ? { ...item, characters: [{ ...item.characters[0], avatarVideos: [video] }] }
      : item
  );

  store.updateAvatarVideoOverlay(video.id, { x: 50, y: 100, scale: 35, opacity: 100 });

  const [updated] = getProjectAvatarVideos(store);
  assert.deepEqual(updated.overlay, { x: 50, y: 100, scale: 35, opacity: 100 });
});

test("store toggles reusable avatar videos for round robin", () => {
  const store = createStore();
  const state = store.getState();
  const project = getSelectedProject(store);
  const video = {
    id: "avatar-video-active-test",
    status: "ready",
    videoUrl: "https://cdn.example.com/avatar-green.mp4",
    isActive: true
  };
  state.projects = state.projects.map((item) =>
    item.id === project.id
      ? { ...item, characters: [{ ...item.characters[0], avatarVideos: [video] }] }
      : item
  );

  store.setAvatarVideoActive(video.id, false);
  assert.equal(getProjectAvatarVideos(store)[0].isActive, false);

  store.setAvatarVideoActive(video.id, true);
  assert.equal(getProjectAvatarVideos(store)[0].isActive, true);
});

test("store updates and approves avatar video cta badge", async () => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (callback) => originalSetTimeout(callback, 0);
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes("/api/images/generate")) {
      const body = JSON.parse(options.body);
      assert.equal(body.aspectRatio, "1:1");
      assert.match(body.prompt, /standalone CTA sticker\/badge asset/);
      return { ok: true, json: async () => ({ taskId: "task_cta_badge" }) };
    }
    if (String(url).includes("/api/images/status")) {
      return { ok: true, json: async () => ({ state: "success", imageUrl: "https://cdn.example.com/cta-badge.png" }) };
    }
    return { ok: true, json: async () => ({}) };
  };
  const store = createStore();
  const state = store.getState();
  const project = getSelectedProject(store);
  const video = {
    id: "avatar-video-cta-test",
    status: "ready",
    videoUrl: "https://cdn.example.com/avatar-green.mp4"
  };
  state.projects = state.projects.map((item) =>
    item.id === project.id
      ? { ...item, characters: [{ ...item.characters[0], avatarVideos: [video] }] }
      : item
  );

  try {
    store.updateAvatarVideoCtaOverlay(video.id, { mode: "text", text: "Подпишись", enabled: true });
    await store.createAvatarVideoCtaCandidate(video.id, { text: "Подпишись" });
    await waitFor(() => getProjectAvatarVideos(store)[0].ctaOverlay.candidate?.status === "review");

    store.approveAvatarVideoCtaCandidate(video.id);
    const updated = getProjectAvatarVideos(store)[0].ctaOverlay;
    assert.equal(updated.mode, "badge");
    assert.equal(updated.badge.status, "approved");
    assert.equal(updated.badge.imageUrl, "https://cdn.example.com/cta-badge.png");
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
  }
});

test("avatar video round robin skips inactive videos", () => {
  const project = {
    characters: [{
      id: "char-round-robin",
      avatarVideoRoundRobinIndex: 1,
      avatarVideos: [
        { id: "inactive", status: "ready", videoUrl: "https://cdn.example.com/inactive.mp4", isActive: false },
        { id: "first", status: "ready", videoUrl: "https://cdn.example.com/first.mp4", isActive: true },
        { id: "second", status: "ready", alphaVideoUrl: "https://cdn.example.com/second.webm", isActive: true }
      ]
    }]
  };

  const pick = pickAvatarVideoRoundRobin(project, "char-round-robin");

  assert.equal(pick.video.id, "second");
  assert.equal(pick.nextIndex, 0);
});

test("avatar round robin skips inactive avatars", () => {
  const project = {
    avatarRoundRobinIndex: 0,
    characters: [{
      id: "disabled-char",
      isActive: false,
      avatarVideos: [
        { id: "disabled-video", status: "ready", videoUrl: "https://cdn.example.com/disabled.mp4", isActive: true }
      ]
    }, {
      id: "active-char",
      isActive: true,
      avatarVideos: [
        { id: "active-video", status: "ready", videoUrl: "https://cdn.example.com/active.mp4", isActive: true }
      ]
    }]
  };

  const pick = pickAvatarVideoRoundRobin(project);

  assert.equal(pick.characterId, "active-char");
  assert.equal(pick.video.id, "active-video");
  assert.equal(pick.nextCharacterIndex, 0);
});

test("avatar round robin rotates active avatars", () => {
  const project = {
    avatarRoundRobinIndex: 1,
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

  const pick = pickAvatarVideoRoundRobin(project);

  assert.equal(pick.characterId, "second-char");
  assert.equal(pick.video.id, "second-video");
  assert.equal(pick.nextCharacterIndex, 0);
});

test("store persists avatar video round robin index after use", () => {
  const store = createStore();
  const state = store.getState();
  const project = getSelectedProject(store);
  const character = {
    ...project.characters[0],
    avatarVideos: [
      { id: "first", status: "ready", videoUrl: "https://cdn.example.com/first.mp4", isActive: true },
      { id: "second", status: "ready", videoUrl: "https://cdn.example.com/second.mp4", isActive: true }
    ]
  };
  state.projects = state.projects.map((item) =>
    item.id === project.id ? { ...item, characters: [character] } : item
  );

  store.markAvatarVideoUsed(character.id, "first", 1);

  const updated = getSelectedProject(store).characters[0];
  assert.equal(updated.avatarVideoRoundRobinIndex, 1);
  assert.ok(updated.avatarVideos[0].lastUsedAt);
});

test("store saves transparent avatar video after chroma video is ready", async () => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (callback) => originalSetTimeout(callback, 0);
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes("/api/images/generate")) return { ok: true, json: async () => ({ taskId: "image-alpha" }) };
    if (String(url).includes("/api/images/status")) {
      return { ok: true, json: async () => ({ state: "success", imageUrl: "https://cdn.example.com/chroma-alpha.png" }) };
    }
    if (String(url).includes("/api/avatar-videos/generate")) return { ok: true, json: async () => ({ taskId: "video-alpha" }) };
    if (String(url).includes("/api/avatar-videos/status")) {
      return { ok: true, json: async () => ({ state: "success", videoUrl: "https://cdn.example.com/avatar-alpha-source.mp4" }) };
    }
    if (String(url).includes("/api/avatar-videos/alpha")) {
      const body = JSON.parse(options.body);
      assert.equal(body.videoUrl, "https://cdn.example.com/avatar-alpha-source.mp4");
      return { ok: true, json: async () => ({ alphaVideoUrl: "/generated/avatar-videos/avatar-alpha.webm" }) };
    }
    return { ok: true, json: async () => ({}) };
  };

  try {
    const store = createStore();
    const state = store.getState();
    const project = getSelectedProject(store);
    state.projects = state.projects.map((item) =>
      item.id === project.id
        ? { ...item, characters: [{ ...item.characters[0], imageData: "https://cdn.example.com/avatar-source.png" }] }
        : item
    );
    await store.createAvatarVideo({ motionPrompt: "small hand wave" });
    await waitFor(() => getProjectAvatarVideos(store)[0]?.alphaStatus === "ready");

    const video = getProjectAvatarVideos(store)[0];
    assert.equal(video.videoUrl, "https://cdn.example.com/avatar-alpha-source.mp4");
    assert.equal(video.alphaVideoUrl, "/generated/avatar-videos/avatar-alpha.webm");
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
  }
});

test("store creates chroma key video task for active approved avatar", async () => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (callback) => originalSetTimeout(callback, 0);
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes("/api/avatars/status")) {
      return { ok: true, json: async () => ({ state: "success", imageUrl: "https://cdn.example.com/avatar.png" }) };
    }
    if (String(url).includes("/api/avatar-videos/status")) {
      return { ok: true, json: async () => ({ state: "success", videoUrl: "https://cdn.example.com/avatar-green.mp4" }) };
    }
    if (String(url).includes("/api/avatar-videos/generate")) {
      const body = JSON.parse(options.body);
      assert.equal(body.imageUrl, "https://cdn.example.com/avatar-chroma.png");
      assert.match(body.prompt, /waist up only/);
      assert.match(body.prompt, /#00FF00/);
      return { ok: true, json: async () => ({ taskId: "task_kling_video_test" }) };
    }
    if (String(url).includes("/api/avatar-videos/alpha")) {
      return { ok: true, json: async () => ({ alphaVideoUrl: "/generated/avatar-videos/avatar-green-alpha.webm" }) };
    }
    if (String(url).includes("/api/images/status")) {
      return { ok: true, json: async () => ({ state: "success", imageUrl: "https://cdn.example.com/avatar-chroma.png" }) };
    }
    if (String(url).includes("/api/images/generate")) {
      const body = JSON.parse(options.body);
      assert.deepEqual(body.inputUrls, ["https://cdn.example.com/avatar.png"]);
      assert.match(body.prompt, /chroma key still image/);
      return { ok: true, json: async () => ({ taskId: "task_chroma_image_test" }) };
    }
    return { ok: true, json: async () => ({ taskId: "task_gptimage_video_avatar" }) };
  };

  try {
    const store = createStore();
    await store.createCharacter({ name: "Video Avatar", prompt: "friendly expert" });
    let project = getSelectedProject(store);
    const candidate = project.avatarCandidates.find((item) => item.name === "Video Avatar");

    await waitFor(() => {
      const project = getSelectedProject(store);
      return project.avatarCandidates.find((item) => item.id === candidate.id)?.status === "review";
    });
    store.approveAvatar(candidate.id);

    await store.createAvatarVideo({ motionPrompt: "calm hand movement" });
    await waitFor(() => {
      const project = getSelectedProject(store);
      const character = project.characters.find((item) => item.name === "Video Avatar");
      return character.avatarVideos?.[0]?.alphaStatus === "ready";
    });

    project = getSelectedProject(store);
    const character = project.characters.find((item) => item.name === "Video Avatar");
    assert.equal(character.avatarVideos[0].imageTaskId, "task_chroma_image_test");
    assert.equal(character.avatarVideos[0].chromaImageUrl, "https://cdn.example.com/avatar-chroma.png");
    assert.equal(character.avatarVideos[0].taskId, "task_kling_video_test");
    assert.equal(character.avatarVideos[0].videoUrl, "https://cdn.example.com/avatar-green.mp4");
    assert.equal(character.avatarVideos[0].alphaVideoUrl, "/generated/avatar-videos/avatar-green-alpha.webm");
    assert.equal(character.avatarVideos[0].settings.aspectRatio, "9:16");
    assert.equal(character.avatarVideos[0].settings.framing, "waist-up medium shot");
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
  }
});

test("store sends local avatar image to chroma key video API", async () => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  const localAvatar = "data:image/png;base64,iVBORw0KGgo=";
  globalThis.setTimeout = (callback) => originalSetTimeout(callback, 0);
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes("/api/images/generate")) {
      const body = JSON.parse(options.body);
      assert.deepEqual(body.inputUrls, [localAvatar]);
      return { ok: true, json: async () => ({ taskId: "task_local_chroma_image" }) };
    }
    if (String(url).includes("/api/images/status")) {
      return { ok: true, json: async () => ({ state: "success", imageUrl: "https://cdn.example.com/local-chroma.png" }) };
    }
    if (String(url).includes("/api/avatar-videos/generate")) {
      const body = JSON.parse(options.body);
      assert.equal(body.imageUrl, "https://cdn.example.com/local-chroma.png");
      return { ok: true, json: async () => ({ taskId: "task_local_avatar_video" }) };
    }
    if (String(url).includes("/api/avatar-videos/status")) {
      return { ok: true, json: async () => ({ state: "success", videoUrl: "https://cdn.example.com/local-avatar.mp4" }) };
    }
    if (String(url).includes("/api/avatar-videos/alpha")) {
      return { ok: true, json: async () => ({ alphaVideoUrl: "/generated/avatar-videos/local-avatar-alpha.webm" }) };
    }
    return { ok: true, json: async () => ({}) };
  };

  try {
    const store = createStore();
    store.uploadCharacter({ name: "Uploaded Avatar", imageName: "avatar.png", imageData: localAvatar });
    await store.createAvatarVideo({ motionPrompt: "small hand wave" });
    await waitFor(() => getSelectedProject(store).characters[0].avatarVideos?.[0]?.alphaStatus === "ready");

    const video = getSelectedProject(store).characters[0].avatarVideos[0];
    assert.equal(getSelectedProject(store).characters[0].provider, "upload");
    assert.equal(video.imageTaskId, "task_local_chroma_image");
    assert.equal(video.chromaImageUrl, "https://cdn.example.com/local-chroma.png");
    assert.equal(video.taskId, "task_local_avatar_video");
    assert.equal(video.videoUrl, "https://cdn.example.com/local-avatar.mp4");
    assert.equal(video.alphaVideoUrl, "/generated/avatar-videos/local-avatar-alpha.webm");
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
  }
});

test("store shows avatar video error when active avatar has no image", async () => {
  const store = createStore();
  const project = getSelectedProject(store);
  const character = { ...project.characters[0], imageData: "" };
  const state = store.getState();
  state.projects = state.projects.map((item) =>
    item.id === project.id ? { ...item, characters: [character] } : item
  );

  await store.createAvatarVideo({ motionPrompt: "small hand wave" });

  const video = getSelectedProject(store).characters[0].avatarVideos[0];
  assert.equal(video.status, "failed");
  assert.match(video.failMsg, /нет изображения/);
});

test("store keeps multiple reusable avatar videos for one avatar", async () => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  let videoIndex = 0;
  globalThis.setTimeout = (callback) => originalSetTimeout(callback, 0);
  globalThis.fetch = async (url) => {
    if (String(url).includes("/api/images/generate")) {
      return { ok: true, json: async () => ({ taskId: `image-${videoIndex}` }) };
    }
    if (String(url).includes("/api/images/status")) {
      return { ok: true, json: async () => ({ state: "success", imageUrl: `https://cdn.example.com/chroma-${videoIndex}.png` }) };
    }
    if (String(url).includes("/api/avatar-videos/generate")) {
      videoIndex += 1;
      return { ok: true, json: async () => ({ taskId: `video-${videoIndex}` }) };
    }
    if (String(url).includes("/api/avatar-videos/status")) {
      return { ok: true, json: async () => ({ state: "success", videoUrl: `https://cdn.example.com/avatar-${videoIndex}.mp4` }) };
    }
    if (String(url).includes("/api/avatar-videos/alpha")) {
      return { ok: true, json: async () => ({ alphaVideoUrl: `/generated/avatar-videos/avatar-${videoIndex}-alpha.webm` }) };
    }
    return { ok: true, json: async () => ({}) };
  };

  try {
    const store = createStore();
    const state = store.getState();
    const project = getSelectedProject(store);
    state.projects = state.projects.map((item) =>
      item.id === project.id
        ? { ...item, characters: [{ ...item.characters[0], imageData: "https://cdn.example.com/avatar-source.png" }] }
        : item
    );
    await store.createAvatarVideo({ motionPrompt: "first motion" });
    await waitFor(() => getProjectAvatarVideos(store).length === 1 && getProjectAvatarVideos(store)[0].alphaStatus === "ready");
    await store.createAvatarVideo({ motionPrompt: "second motion" });
    await waitFor(() => getProjectAvatarVideos(store).length === 2 && getProjectAvatarVideos(store)[0].alphaVideoUrl === "/generated/avatar-videos/avatar-2-alpha.webm");

    const videos = getProjectAvatarVideos(store);
    assert.equal(videos.length, 2);
    assert.equal(videos[0].motionPrompt, "second motion");
    assert.equal(videos[1].motionPrompt, "first motion");
    assert.equal(videos.every((video) => video.isActive !== false), true);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
  }
});

function getSelectedProject(store) {
  const state = store.getState();
  return state.projects.find((item) => item.id === state.selectedProjectId);
}

function getProjectAvatarVideos(store) {
  const project = getSelectedProject(store);
  return project.characters.flatMap((character) => character.avatarVideos || []);
}

async function waitFor(predicate) {
  for (let index = 0; index < 20; index += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("condition was not met");
}
