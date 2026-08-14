import test from "node:test";
import assert from "node:assert/strict";
import {
  approveCtaBadgeCandidate,
  attachCtaBadgeImage,
  attachCtaBadgeTask,
  createCtaBadgeCandidate,
  normalizeCtaOverlay,
  resetCtaOverlay
} from "../src/domain/cta-overlay.js";
import { buildCompositeVideoFilter } from "../scripts/composite-video.mjs";

test("cta overlay defaults to enabled text", () => {
  const overlay = normalizeCtaOverlay();

  assert.equal(overlay.enabled, true);
  assert.equal(overlay.mode, "badge");
  assert.equal(overlay.text, "ЧИТАЙ ОПИСАНИЕ");
  assert.equal(overlay.background, "#ffffff");
  assert.equal(overlay.color, "#111111");
  assert.equal(overlay.prompt, "");
});

test("cta overlay preserves disabled state from form and persisted string values", () => {
  assert.equal(normalizeCtaOverlay({ enabled: false }).enabled, false);
  assert.equal(normalizeCtaOverlay({ enabled: "false" }).enabled, false);
  assert.equal(normalizeCtaOverlay({ enabled: "0" }).enabled, false);
  assert.equal(normalizeCtaOverlay({ enabled: "off" }).enabled, false);
});

test("cta badge candidate can be approved", () => {
  const candidate = createCtaBadgeCandidate({ text: "ЖМИ", prompt: "желтая плашка с черной рамкой" });
  const overlay = approveCtaBadgeCandidate({ mode: "text", text: "ЖМИ", prompt: candidate.prompt, candidate });

  assert.equal(overlay.mode, "badge");
  assert.equal(overlay.text, "ЖМИ");
  assert.equal(overlay.prompt, "желтая плашка с черной рамкой");
  assert.equal(overlay.badge.prompt, "желтая плашка с черной рамкой");
  assert.equal(overlay.badge.status, "approved");
  assert.equal(overlay.candidate, null);
});

test("cta badge candidate carries ai image task state", () => {
  const candidate = createCtaBadgeCandidate({ text: "ЖМИ", prompt: "стеклянная синяя плашка" });
  const running = attachCtaBadgeTask(candidate, "task_badge");
  const ready = attachCtaBadgeImage(running, "https://cdn.example.com/badge.png");

  assert.equal(candidate.status, "submitting");
  assert.match(candidate.finalPrompt, /standalone CTA sticker\/badge asset/);
  assert.match(candidate.finalPrompt, /Text: ЖМИ/);
  assert.equal(running.status, "generating");
  assert.equal(ready.status, "review");
  assert.equal(ready.imageUrl, "https://cdn.example.com/badge.png");
});

test("cta overlay reset returns to default project badge state", () => {
  const reset = resetCtaOverlay({
    mode: "badge",
    text: "ПОДПИШИСЬ",
    prompt: "синяя стеклянная плашка",
    badge: { status: "approved", imageUrl: "https://cdn.example.com/badge.png" },
    candidate: { id: "candidate", status: "review", imageUrl: "https://cdn.example.com/candidate.png" }
  });

  assert.equal(reset.text, "ЧИТАЙ ОПИСАНИЕ");
  assert.equal(reset.prompt, "");
  assert.equal(reset.badge, null);
  assert.equal(reset.candidate, null);
  assert.equal(reset.background, "#ffffff");
  assert.equal(reset.color, "#111111");
});

test("composite filter shows cta from third second", () => {
  const filter = buildCompositeVideoFilter({
    overlay: { x: 50, y: 98, scale: 96, opacity: 100 },
    ctaOverlay: { enabled: true, mode: "badge", text: "ЧИТАЙ ОПИСАНИЕ", x: 50, y: 78, scale: 100, opacity: 100 }
  });

  assert.match(filter, /drawtext/);
  assert.match(filter, /ЧИТАЙ ОПИСАНИЕ/);
  assert.match(filter, /enable='gte\(t,3\)'/);
  assert.match(filter, /color=c=0x111111:s=\d+x\d+:d=5/);
  assert.match(filter, /color=c=0xffffff:s=\d+x\d+:d=5/);
  assert.match(filter, /\[ctaOuter\]\[ctaInner\]overlay=x=\d+:y=\d+:format=auto\[ctaBg\]/);
  assert.match(filter, /fontcolor=0x111111/);
});

test("cta badge fits long text inside the maximum badge width", () => {
  const filter = buildCompositeVideoFilter({
    ctaOverlay: {
      enabled: true,
      mode: "badge",
      text: "ПОДРОБНО ЧИТАЙТЕ ОПИСАНИЕ ПРОДУКТА ЗДЕСЬ",
      x: 50,
      y: 78,
      scale: 100,
      opacity: 100
    }
  });

  const fontSize = Number(filter.match(/\[ctaBg\]drawtext=.*:fontsize=(\d+)/)?.[1]);
  assert.ok(fontSize < 58);
  const badgeWidth = Number(filter.match(/color=c=0x111111:s=(\d+)x/)?.[1]);
  assert.ok(badgeWidth >= 360 && badgeWidth <= 880);
});

test("cta badge shrinks wide glyphs enough to stay inside the box", () => {
  const filter = buildCompositeVideoFilter({
    ctaOverlay: { enabled: true, mode: "badge", text: "Ш".repeat(32), x: 50, y: 78, scale: 100, opacity: 100 }
  });

  const fontSize = Number(filter.match(/\[ctaBg\]drawtext=.*:fontsize=(\d+)/)?.[1]);
  const badgeWidth = Number(filter.match(/color=c=0x111111:s=(\d+)x/)?.[1]);
  assert.ok(fontSize <= 24);
  assert.ok(badgeWidth <= 880);
});

test("composite filter can disable cta overlay", () => {
  const filter = buildCompositeVideoFilter({ ctaOverlay: { enabled: false } });

  assert.doesNotMatch(filter, /drawtext/);
  assert.match(filter, /\[base\]format=yuv420p\[out\]/);
});

test("composite filter uses approved ai badge image when available", () => {
  const filter = buildCompositeVideoFilter({
    ctaOverlay: {
      enabled: true,
      mode: "badge",
      text: "ЧИТАЙ ОПИСАНИЕ",
      x: 50,
      y: 78,
      scale: 100,
      opacity: 90,
      badge: { status: "approved", imageUrl: "https://cdn.example.com/badge.png" }
    },
    hasCtaBadgeInput: true
  });

  assert.match(filter, /\[2:v\]scale=320:-1/);
  assert.match(filter, /colorchannelmixer=aa=0\.90/);
  assert.match(filter, /overlay=x=512-w\/2:y=1398-h\/2/);
  assert.doesNotMatch(filter, /drawtext/);
});
