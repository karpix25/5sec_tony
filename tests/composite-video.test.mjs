import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildAvatarOverlayFilter, buildCompositeVideoFilter } from "../scripts/composite-video.mjs";

test("composite filter maps overlay panel values to ffmpeg placement", () => {
  const filter = buildAvatarOverlayFilter({ x: 68, y: 95, scale: 82, opacity: 75 });

  assert.match(filter, /scale=840:-2/);
  assert.match(filter, /colorchannelmixer=aa=0\.75/);
  assert.match(filter, /overlay=x=696-w\/2:y=1702-h/);
});

test("composite filter clamps unsafe overlay values", () => {
  const filter = buildAvatarOverlayFilter({ x: 200, y: 20, scale: 999, opacity: 0 });

  assert.match(filter, /scale=1536:-2/);
  assert.match(filter, /colorchannelmixer=aa=0\.30/);
  assert.match(filter, /overlay=x=870-w\/2:y=806-h/);
});

test("composite filter allows compact avatar overlay", () => {
  const filter = buildAvatarOverlayFilter({ scale: 35 });

  assert.match(filter, /scale=358:-2/);
});

test("composite filter can render final video without avatar input", () => {
  const filter = buildCompositeVideoFilter({ hasAvatarInput: false, ctaOverlay: { enabled: false } });

  assert.doesNotMatch(filter, /chromakey=0x00FF00/);
  assert.match(filter, /\[bg\]format=rgba\[base\]/);
  assert.match(filter, /\[base\]format=yuv420p\[out\]/);
});

test("composite filter renders default cta badge with rounded border layer", () => {
  const filter = buildCompositeVideoFilter({
    hasAvatarInput: false,
    ctaOverlay: {
      enabled: true,
      mode: "badge",
      text: "ЧИТАЙ ОПИСАНИЕ",
      x: 50,
      y: 78,
      scale: 100,
      opacity: 100,
      background: "#ffffff",
      border: "#111111",
      radius: 10
    }
  });

  assert.match(filter, /color=c=0x111111:s=\d+x\d+:d=5,format=rgba,geq=r='r\(X,Y\)':g='g\(X,Y\)':b='b\(X,Y\)':a='if\(gt\(/);
  assert.match(filter, /color=c=0xffffff:s=\d+x\d+:d=5,format=rgba,geq=r='r\(X,Y\)':g='g\(X,Y\)':b='b\(X,Y\)':a='if\(gt\(/);
  assert.match(filter, /\[ctaOuter\]\[ctaInner\]overlay=x=\d+:y=\d+:format=auto\[ctaBg\]/);
  assert.match(filter, /\[ctaBg\]drawtext=text='ЧИТАЙ ОПИСАНИЕ'/);
  assert.match(filter, /\[base\]\[cta\]overlay=x=512-w\/2:y=1398-h\/2:enable='gte\(t,3\)',format=yuv420p\[out\]/);
});

test("composite filter can read cta text from utf8 textfile", () => {
  const filter = buildCompositeVideoFilter({
    hasAvatarInput: false,
    ctaTextPath: "/tmp/cta.txt",
    ctaOverlay: { enabled: true, mode: "badge", text: "ЧИТАЙ ОПИСАНИЕ" }
  });

  assert.match(filter, /drawtext=(?:fontfile='[^']+':)?textfile='\/tmp\/cta\.txt'/);
  assert.doesNotMatch(filter, /drawtext=[^;]+text='ЧИТАЙ ОПИСАНИЕ'/);
});

test("docker image installs a cyrillic-capable cta font", () => {
  const source = readFileSync(new URL("../Dockerfile", import.meta.url), "utf8");

  assert.match(source, /fonts-dejavu-core/);
});

test("composite video returns local final file without waiting for S3 upload", () => {
  const source = readFileSync(new URL("../scripts/composite-video.mjs", import.meta.url), "utf8");

  assert.doesNotMatch(source, /uploadFileToS3\(outputPath/);
  assert.match(source, /videoUrl:\s*localVideoUrl/);
});

test("composite video uses a fast ffmpeg preset for short renders", () => {
  const source = readFileSync(new URL("../scripts/composite-video.mjs", import.meta.url), "utf8");

  assert.match(source, /"-c:v",\s*"libx264"/);
  assert.match(source, /FFMPEG_VIDEO_PRESET\s*\|\|\s*"veryfast"/);
});
