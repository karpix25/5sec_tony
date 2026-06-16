import test from "node:test";
import assert from "node:assert/strict";
import { buildAvatarOverlayFilter } from "../scripts/composite-video.mjs";

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
