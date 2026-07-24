import test from "node:test";
import assert from "node:assert/strict";
import { getDesignReferencePayload, submitDesignReferenceForm } from "../src/ui/design-form.js";

test("design reference payload uploads image and keeps a durable preview url", async () => {
  const restore = installFormAndFileFakes({ uploadUrl: "/api/reference-assets/ref-preview" });
  const form = createDesignForm({ fileName: "style.png" });

  try {
    const payload = await getDesignReferencePayload(form);

    assert.deepEqual(payload, {
      title: "Столбы",
      imageName: "style.png",
      imageData: "/api/reference-assets/ref-preview"
    });
    assert.equal(form.resetCount, 1);
  } finally {
    restore();
  }
});

test("design reference submit keeps title-only flow for generated templates", async () => {
  const restore = installFormAndFileFakes();
  const calls = [];
  const form = createDesignForm({ fileName: "" });
  const store = {
    createDesignReferenceTemplate(payload) {
      calls.push(["template", payload.title, payload.layoutType || ""]);
    },
    createReference() {
      calls.push(["reference"]);
    }
  };

  try {
    await submitDesignReferenceForm(form, store);
    assert.deepEqual(calls, [["template", "Столбы", ""]]);
  } finally {
    restore();
  }
});

test("design reference submit awaits backend-first reference creation", async () => {
  const restore = installFormAndFileFakes({ uploadUrl: "/api/reference-assets/ref-preview" });
  const calls = [];
  const form = createDesignForm({ fileName: "style.png" });
  const store = {
    async createReference(payload) {
      calls.push(["start", payload.imageData]);
      await wait(10);
      calls.push(["done", payload.title]);
    }
  };

  try {
    await submitDesignReferenceForm(form, store);
    assert.deepEqual(calls, [
      ["start", "/api/reference-assets/ref-preview"],
      ["done", "Столбы"]
    ]);
  } finally {
    restore();
  }
});

test("design reference submit replaces selected reference from replace button", async () => {
  const restore = installFormAndFileFakes({ uploadUrl: "/api/reference-assets/replaced-ref" });
  const calls = [];
  const form = createDesignForm({ fileName: "replace.png" });
  const submitter = { dataset: { replaceReference: "ref-selected" } };
  const store = {
    getState() {
      return {
        selectedProjectId: "project-1",
        selectedReferenceId: "ref-selected",
        projects: [{ id: "project-1", references: [{ id: "ref-selected", imageData: "/old.png" }] }]
      };
    },
    runScopedOperation(config, task) {
      calls.push(["operation", config.scope, config.activeStatus, config.targetId]);
      return task();
    },
    async replaceDesignReference(referenceId, payload) {
      calls.push(["replace", referenceId, payload.imageData]);
    },
    async createReference() {
      calls.push(["create"]);
    }
  };

  try {
    await submitDesignReferenceForm(form, store, { submitter });
    assert.deepEqual(calls, [
      ["operation", "design-reference-upload:project-1", "uploading", "ref-selected"],
      ["replace", "ref-selected", "/api/reference-assets/replaced-ref"]
    ]);
  } finally {
    restore();
  }
});

function createDesignForm({ fileName }) {
  return {
    resetCount: 0,
    reset() {
      this.resetCount += 1;
    },
    querySelector(selector) {
      if (selector !== "input[type='file']" || !fileName) return { files: [] };
      return { files: [{ name: fileName }] };
    }
  };
}

function installFormAndFileFakes({ uploadUrl = "" } = {}) {
  const originalFetch = globalThis.fetch;
  const originalFormData = globalThis.FormData;
  const originalFileReader = globalThis.FileReader;

  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ url: uploadUrl })
  });
  globalThis.FormData = class FakeFormData {
    constructor() {}
    entries() {
      return [["title", "Столбы"]][Symbol.iterator]();
    }
  };
  globalThis.FileReader = class FakeFileReader {
    readAsDataURL(file) {
      this.result = `data:image/png;base64,${file.name}`;
      this.onload();
    }
  };

  return () => {
    globalThis.fetch = originalFetch;
    globalThis.FormData = originalFormData;
    globalThis.FileReader = originalFileReader;
  };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
