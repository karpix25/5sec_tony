import test from "node:test";
import assert from "node:assert/strict";
import { buildAvatarChromaImagePrompt, buildAvatarVideoPrompt, createAvatarVideoRecord } from "../src/domain/avatar-video.js";
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

  assert.deepEqual(video.overlay, { x: 75, y: 100, scale: 37, opacity: 100 });
  assert.equal(video.ctaOverlay.text, "ЧИТАЙ ОПИСАНИЕ");
  assert.equal(video.ctaOverlay.mode, "badge");
  assert.equal(video.ctaOverlay.background, "#ffffff");
  assert.equal(video.ctaOverlay.color, "#111111");
  assert.equal(video.ctaOverlay.enabled, true);
  assert.equal(video.isActive, true);
});

test("avatar overlay accepts compact scale", () => {
  const video = createAvatarVideoRecord({ name: "Compact Avatar" }, { overlay: { scale: 35 } });

  assert.equal(video.overlay.scale, 35);
});
