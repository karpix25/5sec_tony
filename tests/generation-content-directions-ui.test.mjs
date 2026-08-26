import test from "node:test";
import assert from "node:assert/strict";
import { bindGenerationPanelEvents } from "../src/ui/generation.js";
import { projects, products } from "../src/domain/entities.js";
import { FakeElement } from "./helpers/fake-ui-dom.mjs";

test("generation start sends the operator-selected content directions", async () => {
  const previousFetch = globalThis.fetch;
  const project = projects[0];
  const product = products.find((item) => item.projectId === project.id);
  const root = new FakeElement();
  const createJobButton = new FakeElement({ id: "create-job", tagName: "button" });
  const direction = new FakeElement({
    tagName: "input",
    type: "checkbox",
    checked: true,
    dataset: { contentDirectionToggle: "sleep-hygiene" }
  });
  root.append(
    createJobButton,
    new FakeElement({ id: "generation-count", value: "1" }),
    new FakeElement({ id: "generation-distribute-products", type: "checkbox" }),
    new FakeElement({ id: "reference-select", value: project.references[0].id }),
    new FakeElement({ id: "character-select", value: "__no_avatar__" }),
    new FakeElement({ id: "audio-select" }),
    new FakeElement({ id: "creative-team-status" }),
    direction
  );
  const requests = [];
  const state = {
    projects: [project],
    products: [product],
    selectedProjectId: project.id,
    selectedProductId: product.id,
    selectedReferenceId: project.references[0].id,
    selectedCharacterId: "__no_avatar__",
    selectedAudioId: "",
    freePrompt: "",
    jobs: []
  };
  const store = {
    getState: () => state,
    createPendingServerGenerationBatch: ({ selection }) => ({ batchId: "batch-directions", accepted: true, jobs: [{ id: "job-directions", selectionSnapshot: selection }] }),
    failPendingGenerationBatch() {},
    mergeServerJobs(jobs) { return jobs; },
    selectProjectTab() {}
  };
  globalThis.fetch = async (_url, options = {}) => {
    const body = JSON.parse(options.body || "{}");
    requests.push(body);
    return { ok: true, json: async () => ({ jobs: [{ id: "job-directions" }] }) };
  };

  try {
    bindGenerationPanelEvents(root, store);
    createJobButton.dispatchEvent({ type: "click", target: createJobButton });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(requests[0].selection.contentDirectionIds, ["sleep-hygiene"]);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
