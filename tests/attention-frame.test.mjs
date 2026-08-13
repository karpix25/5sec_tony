import test from "node:test";
import assert from "node:assert/strict";
import { ATTENTION_FRAMES, selectAttentionFrame, validateHeadlineSafety } from "../src/domain/attention-frame.js";

test("attention frame rotates to the least-used AI presentation", () => {
  const frame = selectAttentionFrame({ recentFrames: ["recognition", "recognition", "diagnostic", "contrast"] });
  assert.equal(frame, "loss");
  assert.equal(ATTENTION_FRAMES.includes(frame), true);
});

test("headline safety rejects instead of rewriting a bad AI headline", () => {
  const headline = "Почему мембрана это не просто";
  assert.deepEqual(validateHeadlineSafety(headline), ["headline_incomplete"]);
  assert.equal(validateHeadlineSafety("Кожа скрипит после душа — смыли защиту").length, 0);
});
