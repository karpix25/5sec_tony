import test from "node:test";
import assert from "node:assert/strict";
import { createInitialState } from "../src/state/initial-state.js";
import { createStore } from "../src/state/store.js";

test("ordinary save preserves a background ai field that the user did not edit", async () => {
  const originalFetch = globalThis.fetch;
  const remoteState = createInitialState();
  const projectId = remoteState.selectedProjectId;
  const project = remoteState.projects.find((item) => item.id === projectId);
  project.companyAudience = "";
  const requests = [];
  let version = 0;
  globalThis.fetch = async (url, options = {}) => {
    if (url === "/api/state" && (!options.method || options.method === "GET")) {
      return jsonResponse({ state: remoteState, updatedAt: "job-t0", refreshUpdatedAt: "catalog-t0" });
    }
    if (url === `/api/projects/${projectId}` && options.method === "PATCH") {
      const body = JSON.parse(options.body);
      requests.push(body);
      version += 1;
      Object.assign(project, body.project);
      return jsonResponse({
        saved: true,
        project: { ...project },
        updatedAt: `job-t${version}`,
        refreshUpdatedAt: `catalog-t${version}`
      });
    }
    return jsonResponse({ error: `unexpected ${url}` }, 500);
  };

  try {
    const store = createStore();
    await store.whenHydrated();
    await store.updateProjectPatchRemote(projectId, { companyAudience: "AI ЦА" });
    await store.updateProjectSettingsRemote({ companyAudience: "" }, {
      savedSnapshot: { companyAudience: "" },
      preserveFields: ["companyAudience"]
    });

    assert.equal(requests[1].project.companyAudience, "AI ЦА");
    assert.equal(store.getState().projects.find((item) => item.id === projectId).companyAudience, "AI ЦА");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  };
}
