import test from "node:test";
import assert from "node:assert/strict";
import { approveCtaBadgeCandidate, createCtaBadgeCandidate, normalizeCtaOverlay } from "../src/domain/cta-overlay.js";
import { buildCompositeVideoFilter } from "../scripts/composite-video.mjs";

test("cta overlay defaults to enabled text", () => {
  const overlay = normalizeCtaOverlay();

  assert.equal(overlay.enabled, true);
  assert.equal(overlay.mode, "text");
  assert.equal(overlay.text, "ПОДПИШИСЬ");
});

test("cta badge candidate can be approved", () => {
  const candidate = createCtaBadgeCandidate({ text: "ЖМИ" });
  const overlay = approveCtaBadgeCandidate({ mode: "text", text: "ЖМИ", candidate });

  assert.equal(overlay.mode, "badge");
  assert.equal(overlay.text, "ЖМИ");
  assert.equal(overlay.badge.status, "approved");
  assert.equal(overlay.candidate, null);
});

test("composite filter shows cta from third second", () => {
  const filter = buildCompositeVideoFilter({
    overlay: { x: 50, y: 98, scale: 96, opacity: 100 },
    ctaOverlay: { enabled: true, mode: "badge", text: "ПОДПИШИСЬ", x: 50, y: 78, scale: 100, opacity: 100 }
  });

  assert.match(filter, /drawtext/);
  assert.match(filter, /ПОДПИШИСЬ/);
  assert.match(filter, /enable='gte\(t,3\)'/);
  assert.match(filter, /box=1/);
});

test("composite filter can disable cta overlay", () => {
  const filter = buildCompositeVideoFilter({ ctaOverlay: { enabled: false } });

  assert.doesNotMatch(filter, /drawtext/);
  assert.match(filter, /\[base\]format=yuv420p\[out\]/);
});
