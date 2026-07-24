import test from "node:test";
import assert from "node:assert/strict";
import { buildAvatarChromaImagePrompt, buildAvatarVideoPrompt, createAvatarVideoRecord } from "../src/domain/avatar-video.js";
import { buildAvatarAlphaFfmpegArgs } from "../scripts/avatar-alpha-video.mjs";

test("avatar video prompt locks chroma key framing contract", () => {
  const prompt = buildAvatarVideoPrompt({ name: "Антон" }, "небольшой жест рукой");

  assert.match(prompt, /ЯЗЫК ФИНАЛЬНОГО РОЛИКА/);
  assert.match(prompt, /вертикальное 9:16 хромакей-видео/);
  assert.match(prompt, /только по пояс/);
  assert.match(prompt, /примерно 65% высоты кадра/);
  assert.match(prompt, /#00FF00/);
  assert.match(prompt, /Камера статична/);
  assert.match(prompt, /Не показывать полный рост/);
  assert.match(prompt, /небольшой жест рукой/);
  assert.doesNotMatch(prompt, /Motion instruction|Do not show full body|Static camera/);
});

test("avatar chroma image prompt prepares the green-screen still first", () => {
  const prompt = buildAvatarChromaImagePrompt({ name: "Антон" }, "небольшой жест рукой");

  assert.match(prompt, /image-to-image/);
  assert.match(prompt, /ту же идентичность аватара/);
  assert.match(prompt, /#00FF00/);
  assert.match(prompt, /Кадр только по пояс/);
  assert.match(prompt, /Будущее движение: небольшой жест рукой/);
  assert.doesNotMatch(prompt, /same avatar identity|Frame waist-up only|Future motion to support/);
});

test("avatar video record defaults do not introduce English motion prompt", () => {
  const video = createAvatarVideoRecord({ name: "Антон" });

  assert.match(video.motionPrompt, /Спокойные естественные микродвижения/);
  assert.match(video.finalPrompt, /ЯЗЫК ФИНАЛЬНОГО РОЛИКА/);
  assert.match(video.imagePrompt, /ЯЗЫК ФИНАЛЬНОГО РОЛИКА/);
  assert.doesNotMatch(video.finalPrompt, /Subtle natural idle movements|small hand gestures/);
  assert.doesNotMatch(video.imagePrompt, /Subtle natural idle movements|small hand gestures/);
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
