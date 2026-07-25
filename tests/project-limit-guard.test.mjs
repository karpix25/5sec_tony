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

test("project limit guard preserves raised server limit for stale project saves", () => {
  const protectedProject = protectProjectLimitFloor(
    { id: "project-1", projectLimit: 21, usedTotal: 21 },
    { id: "project-1", projectLimit: 25, usedTotal: 21 }
  );

  assert.equal(protectedProject.projectLimit, 25);
});

test("project limit guard allows deliberate lowering above used total", () => {
  const protectedProject = protectProjectLimitFloor(
    { id: "project-1", projectLimit: 50, usedTotal: 21 },
    { id: "project-1", projectLimit: 100, usedTotal: 21 }
  );

  assert.equal(protectedProject.projectLimit, 50);
});
