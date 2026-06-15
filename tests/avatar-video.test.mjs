import test from "node:test";
import assert from "node:assert/strict";
import { buildAvatarChromaImagePrompt, buildAvatarVideoPrompt, createAvatarVideoRecord } from "../src/domain/avatar-video.js";
import { createStore } from "../src/state/store.js";
import { buildAvatarAlphaFfmpegArgs } from "../scripts/avatar-alpha-video.mjs";

test("avatar video prompt locks chroma key framing contract", () => {
  const prompt = buildAvatarVideoPrompt({ name: "Anton" }, "small hand gesture");

  assert.match(prompt, /vertical 9:16 chroma key video/);
  assert.match(prompt, /waist up only/);
  assert.match(prompt, /occupies about 65% of frame height/);
  assert.match(prompt, /#00FF00/);
  assert.match(prompt, /Static camera, no zoom/);
  assert.match(prompt, /Do not show full body/);
  assert.match(prompt, /small hand gesture/);
});

test("avatar chroma image prompt prepares the green-screen still first", () => {
  const prompt = buildAvatarChromaImagePrompt({ name: "Anton" }, "small hand gesture");

  assert.match(prompt, /image-to-image/);
  assert.match(prompt, /same avatar identity/);
  assert.match(prompt, /#00FF00/);
  assert.match(prompt, /Frame waist-up only/);
  assert.match(prompt, /Future motion to support: small hand gesture/);
});

test("avatar alpha ffmpeg args keep webm transparency", () => {
  const args = buildAvatarAlphaFfmpegArgs({ inputPath: "input.mp4", outputPath: "output.webm" });

  assert.equal(args.includes("chromakey=0x00FF00:0.18:0.08,format=yuva420p"), true);
  assert.equal(args.includes("libvpx-vp9"), true);
  assert.equal(args.includes("yuva420p"), true);
  assert.equal(args.includes("-an"), true);
  assert.equal(args.at(-1), "output.webm");
});

test("avatar overlay defaults anchor video near the bottom", () => {
  const video = createAvatarVideoRecord({ name: "Overlay Avatar" });

  assert.deepEqual(video.overlay, { x: 50, y: 98, scale: 96, opacity: 100 });
});

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

  store.updateAvatarVideoOverlay(video.id, { x: 50, y: 100, scale: 92, opacity: 100 });

  const [updated] = getProjectAvatarVideos(store);
  assert.deepEqual(updated.overlay, { x: 50, y: 100, scale: 92, opacity: 100 });
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
    const state = store.getState();
    const project = getSelectedProject(store);
    const character = { ...project.characters[0], imageData: localAvatar };
    state.projects = state.projects.map((item) =>
      item.id === project.id ? { ...item, characters: [character] } : item
    );
    await store.createAvatarVideo({ motionPrompt: "small hand wave" });
    await waitFor(() => getSelectedProject(store).characters[0].avatarVideos?.[0]?.alphaStatus === "ready");

    const video = getSelectedProject(store).characters[0].avatarVideos[0];
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

test("store keeps only one reusable avatar video per project", async () => {
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
    await waitFor(() => getProjectAvatarVideos(store).length === 1 && getProjectAvatarVideos(store)[0].alphaVideoUrl === "/generated/avatar-videos/avatar-2-alpha.webm");

    const videos = getProjectAvatarVideos(store);
    assert.equal(videos.length, 1);
    assert.equal(videos[0].motionPrompt, "second motion");
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
