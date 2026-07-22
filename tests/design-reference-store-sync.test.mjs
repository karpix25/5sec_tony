import test from "node:test";
import assert from "node:assert/strict";
import { createInitialState } from "../src/state/initial-state.js";
import { ensureProjectAssets } from "../src/state/factories.js";
import { createStore } from "../src/state/store.js";

test("remote design reference create uses backend endpoint and skips full state save", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const remoteState = createInitialState();
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url === "/api/state" && (!options.method || options.method === "GET")) {
      return jsonResponse({ state: remoteState, updatedAt: "db-v1" });
    }
    if (String(url).includes("/design-references") && options.method === "POST") {
      const body = JSON.parse(options.body);
      const project = remoteState.projects.find((item) => item.id === remoteState.selectedProjectId);
      return jsonResponse({
        saved: true,
        reference: body.reference,
        project: { ...project, references: [body.reference, ...project.references] },
        updatedAt: "db-v2"
      });
    }
    if (url === "/api/state" && options.method === "POST") {
      return jsonResponse({ error: "full state save should not be used for design reference create" }, 500);
    }
    return jsonResponse({ error: `unexpected ${url}` }, 500);
  };

  try {
    const store = createStore();
    await store.whenHydrated();
    calls.length = 0;

    await store.createReference({ title: "Новый русский реф", imageData: "/api/reference-assets/new-ref" });
    await wait(320);

    const designCall = calls.find((call) => String(call.url).includes("/design-references"));
    assert.ok(designCall);
    assert.equal(JSON.parse(designCall.options.body).baseUpdatedAt, "db-v1");
    assert.equal(store.getState().projects[0].references[0].title, "Новый русский реф");
    assert.equal(calls.filter((call) => call.url === "/api/state" && call.options.method === "POST").length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("remote selected design reference update uses backend endpoint", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const remoteState = createInitialState();
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url === "/api/state" && (!options.method || options.method === "GET")) {
      return jsonResponse({ state: remoteState, updatedAt: "db-v1" });
    }
    if (String(url).includes("/design-references/") && options.method === "PATCH") {
      const body = JSON.parse(options.body);
      const project = remoteState.projects.find((item) => item.id === remoteState.selectedProjectId);
      const reference = { ...project.references[0], ...body.patch };
      return jsonResponse({
        saved: true,
        reference,
        project: { ...project, references: [reference, ...project.references.slice(1)] },
        updatedAt: "db-v2"
      });
    }
    if (url === "/api/state" && options.method === "POST") {
      return jsonResponse({ error: "full state save should not be used for design reference update" }, 500);
    }
    return jsonResponse({ error: `unexpected ${url}` }, 500);
  };

  try {
    const store = createStore();
    await store.whenHydrated();
    calls.length = 0;

    await store.updateSelectedDesignReference({ takeaways: "новые русские тезисы" });
    await wait(320);

    const patchCall = calls.find((call) => String(call.url).includes("/design-references/") && call.options.method === "PATCH");
    assert.ok(patchCall);
    assert.equal(store.getState().projects[0].references[0].takeaways, "новые русские тезисы");
    assert.equal(calls.filter((call) => call.url === "/api/state" && call.options.method === "POST").length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("legacy ppm design reference is not auto-injected during project normalization", () => {
  const project = ensureProjectAssets({
    id: "ppm",
    name: "Плати по миру",
    references: [{ id: "custom-ref", type: "design", title: "Русский новый реф" }]
  });

  assert.deepEqual(project.references.map((reference) => reference.id), ["custom-ref"]);
  assert.equal(project.references[0].title, "Русский новый реф");
});

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
