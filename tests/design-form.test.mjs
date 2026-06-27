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
