import test from "node:test";
import assert from "node:assert/strict";
import { writeHookFromFormula } from "../src/domain/hook-formula-writer.js";

const context = {
  subject: "вечерняя привычка",
  object: "вечерняя привычка",
  problem: "тяжело уснуть",
  result: "спокойное восстановление",
  count: "5",
  variantSeed: "headline-diversity-test"
};

test("hook writer rotates why after two recent curiosity headlines", () => {
  const hook = writeHookFromFormula("Почему сон не восстанавливает", {
    ...context,
    existingJobs: [
      { title: "Почему вечером сложно уснуть" },
      { finalContent: { headline: "Почему сон не дает сил" } }
    ]
  });

  assert.doesNotMatch(hook, /^Почему(?:\s|$)/i);
});

test("hook writer preserves a locked formula", () => {
  const hook = writeHookFromFormula("Почему сон не восстанавливает", {
    ...context,
    locked: true,
    existingJobs: [
      { title: "Почему вечером сложно уснуть" },
      { title: "Почему сон не дает сил" }
    ]
  });

  assert.match(hook, /^Почему(?:\s|$)/i);
});
