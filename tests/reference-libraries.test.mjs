import test from "node:test";
import assert from "node:assert/strict";
import { mergeHydratedReferenceState, normalizePersistedReferenceState } from "../src/state/reference-libraries.js";

test("legacy hook records are removed from active client state", () => {
  const state = normalizePersistedReferenceState({
    hookLibrary: legacyHookLibrary("Первый хук"),
    reelsResearch: {
      videos: [{ id: "1", account: "demo", topic: "Тема" }],
      summary: { hookPatterns: ["Миф -> факт"] }
    }
  });

  assert.equal("hookLibrary" in state, false);
  assert.equal(state.reelsResearch.videos.length, 1);
  assert.deepEqual(state.reelsResearch.summary.hookPatterns, ["Миф -> факт"]);
});

test("hydration keeps research and drops archived hook data", () => {
  const localState = normalizePersistedReferenceState({
    hookLibrary: legacyHookLibrary("7 сигналов по теме"),
    reelsResearch: { videos: [{ id: "2", account: "demo", topic: "Сюжет" }], summary: {} }
  });
  const merged = mergeHydratedReferenceState({
    hookLibrary: { activeVersionId: "", versions: [] },
    reelsResearch: null
  }, localState);

  assert.equal("hookLibrary" in merged, false);
  assert.equal(merged.reelsResearch.videos[0].topic, "Сюжет");
});

function legacyHookLibrary(text) {
  return {
    activeVersionId: "legacy-v1",
    versions: [{ id: "legacy-v1", status: "archive", hooks: [{ id: "legacy-h1", text }] }]
  };
}
