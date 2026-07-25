import test from "node:test";
import assert from "node:assert/strict";
import { protectProjectLimitFloor } from "../scripts/project-limit-guard.mjs";

test("project limit guard preserves raised server limit for stale full-state snapshots", () => {
  const protectedProject = protectProjectLimitFloor(
    { id: "project-1", projectLimit: 21, usedTotal: 21 },
    { id: "project-1", projectLimit: 25, usedTotal: 21 }
  );

  assert.equal(protectedProject.projectLimit, 25);
});

test("project limit guard allows explicit project save down to used total", () => {
  const protectedProject = protectProjectLimitFloor(
    { id: "project-1", projectLimit: 21, usedTotal: 21 },
    { id: "project-1", projectLimit: 25, usedTotal: 21 },
    { allowLowerToUsedTotal: true }
  );

  assert.equal(protectedProject.projectLimit, 21);
});
