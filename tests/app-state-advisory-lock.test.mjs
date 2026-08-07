import test from "node:test";
import assert from "node:assert/strict";
import { lockAppStateMutation } from "../scripts/app-state-advisory-lock.mjs";

test("full saves and project workers share the same global job lock", async () => {
  const fullSave = [];
  const worker = [];
  await lockAppStateMutation(async (_text, params) => { fullSave.push(params); return { rows: [] }; }, "default");
  await lockAppStateMutation(async (_text, params) => { worker.push(params); return { rows: [] }; }, "default", "project-new");

  assert.deepEqual(fullSave[0], ["anton-5sec:app-state", "default:jobs"]);
  assert.deepEqual(worker[0], fullSave[0]);
  assert.deepEqual(worker[1], ["anton-5sec:app-state", "default:project:project-new"]);
});
