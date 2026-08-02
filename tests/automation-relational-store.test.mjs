import test from "node:test";
import assert from "node:assert/strict";
import {
  patchAutomationProject,
  persistAutomationStateDelta,
  shouldUseRelationalAutomation
} from "../scripts/automation/relational-state-store.mjs";

test("relational automation mode is enabled only for production persistence", () => {
  assert.equal(shouldUseRelationalAutomation({ isPostgresConfigured: () => true }), true);
  assert.equal(shouldUseRelationalAutomation({ isPostgresConfigured: () => true, updateGenerationState: async () => {} }), false);
  assert.equal(shouldUseRelationalAutomation({ isPostgresConfigured: () => true, optimizedPersistence: false }), false);
});

test("automation delta writes targeted rows without rebuilding app_state", async () => {
  const calls = [];
  const query = async (text, params = []) => {
    calls.push({ text, params });
    if (text.includes("select id from studio_projects")) return { rows: [{ id: params[1] }] };
    return { rows: [] };
  };
  const previous = {
    projects: [{ id: "project-1", automation: { enabled: true, status: "dispatching" } }],
    products: [],
    jobs: [{ id: "job-old", projectId: "project-1", status: "running", stage: "brief" }],
    selectedProjectTab: "generation"
  };
  const next = {
    projects: [{ id: "project-1", automation: { enabled: true, status: "running" } }],
    products: [],
    jobs: [
      { id: "job-new", projectId: "project-1", status: "running", stage: "brief", inputUrls: [], inputRefs: [] },
      { id: "job-old", projectId: "project-1", status: "done", stage: "review" }
    ],
    selectedProjectTab: "queue"
  };

  await persistAutomationStateDelta(previous, next, {
    appStateKey: "test-state",
    withPostgresTransaction: async (callback) => callback({ query })
  });

  assert.ok(calls.some(({ text }) => text.includes("update studio_projects")));
  assert.ok(calls.some(({ text }) => text.includes("insert into studio_jobs")));
  assert.ok(calls.some(({ text }) => text.includes("update studio_jobs")));
  assert.ok(calls.some(({ text }) => text.includes("studio_app_ui_state")));
  assert.equal(calls.some(({ text }) => text.includes("app_state set data")), false);
  assert.equal(calls.some(({ text }) => text.includes("delete from studio_jobs")), false);
});

test("automation project patch updates one project under scoped lock", async () => {
  const calls = [];
  await patchAutomationProject("project-1", { status: "running", lastMessage: "ok" }, {
    appStateKey: "test-state",
    withPostgresTransaction: async (callback) => callback({
      query: async (text, params = []) => {
        calls.push({ text, params });
        if (text.includes("select id from studio_projects")) return { rows: [{ id: "project-1" }] };
        if (text.includes("select automation")) return { rows: [{ automation: { enabled: true, status: "dispatching" } }] };
        return { rows: [] };
      }
    })
  });

  assert.deepEqual(calls[0].params, ["anton-5sec:app-state", "test-state:project:project-1"]);
  assert.ok(calls.some(({ text }) => text.includes("set automation")));
});
