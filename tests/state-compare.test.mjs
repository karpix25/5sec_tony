import test from "node:test";
import assert from "node:assert/strict";
import { statesEqual } from "../scripts/state-compare.mjs";

test("state comparison ignores object key order", () => {
  assert.equal(
    statesEqual(
      { jobs: [{ id: "job-1", title: "A" }], projects: [{ id: "project-1", name: "P" }] },
      { projects: [{ name: "P", id: "project-1" }], jobs: [{ title: "A", id: "job-1" }] }
    ),
    true
  );
});

test("state comparison keeps array order significant", () => {
  assert.equal(
    statesEqual(
      { jobs: [{ id: "job-1" }, { id: "job-2" }] },
      { jobs: [{ id: "job-2" }, { id: "job-1" }] }
    ),
    false
  );
});
