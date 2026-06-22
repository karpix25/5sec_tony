import test from "node:test";
import assert from "node:assert/strict";
import { applyHookDraft, createHookDraft } from "../src/domain/hook-library.js";
import { mergeHydratedReferenceState, normalizePersistedReferenceState } from "../src/state/reference-libraries.js";

test("normalize persisted reference state keeps hook library and research in stable shape", () => {
  const state = normalizePersistedReferenceState({
    hookLibrary: applyHookDraft({ versions: [] }, createHookDraft({ text: "Первый хук" })),
    reelsResearch: {
      videos: [{ id: "1", account: "demo", topic: "Тема" }],
      summary: { hookPatterns: ["Миф -> факт"] }
    }
  });

  assert.equal(state.hookLibrary.versions.length, 1);
  assert.equal(state.hookLibrary.versions[0].hooks[0].text, "Первый хук");
  assert.equal(state.reelsResearch.videos.length, 1);
  assert.deepEqual(state.reelsResearch.summary.hookPatterns, ["Миф -> факт"]);
});

test("hydrated remote state inherits legacy hook library and research when db is still empty", () => {
  const localState = normalizePersistedReferenceState({
    hookLibrary: applyHookDraft({ versions: [] }, createHookDraft({ text: "7 сигналов по теме" })),
    reelsResearch: { videos: [{ id: "2", account: "demo", topic: "Сюжет" }], summary: {} }
  });
  const merged = mergeHydratedReferenceState({
    hookLibrary: { activeVersionId: "", versions: [] },
    reelsResearch: null
  }, localState);

  assert.equal(merged.hookLibrary.versions[0].hooks[0].text, "7 сигналов по теме");
  assert.equal(merged.reelsResearch.videos[0].topic, "Сюжет");
});
