import test from "node:test";
import assert from "node:assert/strict";
import { updateAvatarVideoRecord } from "../src/domain/avatar-video.js";
import { updateDesignReferenceCandidate } from "../src/domain/design-reference-candidate.js";

test("avatar video status maps terminal error state to failed", () => {
  const updated = updateAvatarVideoRecord(
    { id: "video-1", status: "waiting", failMsg: "" },
    { state: "error", failMsg: "provider returned fatal error" }
  );

  assert.equal(updated.status, "failed");
  assert.equal(updated.failMsg, "provider returned fatal error");
});

test("design reference status maps terminal error state to failed", () => {
  const updated = updateDesignReferenceCandidate(
    { id: "design-1", status: "generating", progress: 45, failMsg: "" },
    { state: "error", progress: 46, failMsg: "image generation failed" }
  );

  assert.equal(updated.status, "failed");
  assert.equal(updated.progress, 46);
  assert.equal(updated.failMsg, "image generation failed");
});
