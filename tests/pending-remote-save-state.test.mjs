import test from "node:test";
import assert from "node:assert/strict";
import { compactStateForPendingRemoteSave } from "../src/state/pending-remote-save-state.js";

test("pending remote save drops heavy generated job payloads", () => {
  const state = {
    jobs: [{
      id: "job-1",
      status: "running",
      stage: "image",
      title: "Тема",
      prompt: "x".repeat(10000),
      promptContract: { large: true },
      imagePromptContract: { large: true },
      aiTrace: { raw: "x".repeat(10000) },
      finalVideoUrl: "/generated/final.mp4",
      diskUrl: "https://disk.yandex.ru/i/final"
    }]
  };

  const compacted = compactStateForPendingRemoteSave(state);

  assert.equal(compacted.jobs[0].id, "job-1");
  assert.equal(compacted.jobs[0].finalVideoUrl, "/generated/final.mp4");
  assert.equal(compacted.jobs[0].diskUrl, "https://disk.yandex.ru/i/final");
  assert.equal("prompt" in compacted.jobs[0], false);
  assert.equal("promptContract" in compacted.jobs[0], false);
  assert.equal("imagePromptContract" in compacted.jobs[0], false);
  assert.equal("aiTrace" in compacted.jobs[0], false);
});
