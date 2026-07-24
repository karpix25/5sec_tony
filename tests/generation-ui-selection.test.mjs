import test from "node:test";
import assert from "node:assert/strict";
import { bindGenerationPanelEvents } from "../src/ui/generation.js";
import { projects, products } from "../src/domain/entities.js";
import { FakeElement } from "./helpers/fake-ui-dom.mjs";

function createGenerationDom(controls = {}) {
  const root = new FakeElement();
  const createJobButton = new FakeElement({ id: "create-job", tagName: "button" });
  const countInput = new FakeElement({ id: "generation-count", value: "1" });
  const distributeProducts = new FakeElement({ id: "generation-distribute-products", type: "checkbox" });
  const referenceSelect = new FakeElement({ id: "reference-select", tagName: "select", value: controls.referenceId || "" });
  const characterSelect = new FakeElement({ id: "character-select", tagName: "select", value: controls.characterId || "" });
  const audioSelect = new FakeElement({ id: "audio-select", tagName: "select", value: controls.audioId || "" });
  const status = new FakeElement({ id: "creative-team-status" });
  root.append(createJobButton, countInput, distributeProducts, referenceSelect, characterSelect, audioSelect, status);
  return { root, createJobButton };
}

async function waitForGenerationTicks(count = 3) {
  for (let index = 0; index < count; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

test("generation start uses visible control values over stale store selection", async () => {
  const previousFetch = globalThis.fetch;
  const project = {
    ...projects[0],
    references: [
      { ...projects[0].references[0], id: "ref-pink", title: "розовый стиль" },
      { ...projects[0].references[0], id: "ref-funnel", title: "Воронка" }
    ]
  };
  const product = products.find((item) => item.projectId === project.id);
  const { root, createJobButton } = createGenerationDom({
    referenceId: "ref-funnel",
    characterId: "__no_avatar__",
    audioId: "audio-visible"
  });
  const requests = [];
  const state = {
    projects: [project],
    products: [product],
    selectedProjectId: project.id,
    selectedProductId: product.id,
    selectedReferenceId: "ref-pink",
    selectedCharacterId: "__no_avatar__",
    selectedAudioId: "audio-stale",
    freePrompt: "",
    jobs: []
  };
  const store = {
    getState: () => state,
    createPendingServerGenerationBatch: ({ selection }) => ({
      batchId: "batch-visible-controls",
      accepted: true,
      jobs: [{ id: "job-visible-controls", selectionSnapshot: selection }]
    }),
    failPendingGenerationBatch() {},
    mergeServerJobs(jobs = []) {
      return jobs;
    },
    selectProjectTab() {}
  };
  globalThis.fetch = async (url, options = {}) => {
    const body = JSON.parse(options.body || "{}");
    requests.push([url, body]);
    return {
      ok: true,
      json: async () => ({
        batchId: body.reservation.batchId,
        jobs: [{ id: body.reservation.jobIds[0], projectId: project.id, productId: product.id, status: "running", stage: "brief" }]
      })
    };
  };

  try {
    bindGenerationPanelEvents(root, store);
    createJobButton.dispatchEvent({ type: "click", target: createJobButton });
    await waitForGenerationTicks();

    assert.equal(requests[0][1].selection.referenceId, "ref-funnel");
    assert.equal(requests[0][1].selection.audioId, "audio-visible");
  } finally {
    globalThis.fetch = previousFetch;
  }
});
