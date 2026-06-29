import test from "node:test";
import assert from "node:assert/strict";
import { getProductReferencePayload } from "../src/ui/product.js";

test("product reference payload reads the first file as data url and resets the form", async () => {
  const originalFormData = globalThis.FormData;
  const originalFileReader = globalThis.FileReader;
  const originalFetch = globalThis.fetch;
  const resetCalls = [];
  const file = { name: "front.png" };
  const uploads = [];
  const form = {
    reset() {
      resetCalls.push("reset");
    },
    querySelector(selector) {
      return selector === "input[type='file']" ? { files: [file] } : null;
    }
  };

  globalThis.FormData = class FakeFormData {
    constructor() {}
    entries() {
      return [["title", "Упаковка"], ["promptComment", "крупный фронтальный ракурс"]][Symbol.iterator]();
    }
  };
  globalThis.FileReader = class FakeFileReader {
    readAsDataURL(nextFile) {
      this.result = `data:image/png;base64,${nextFile.name}`;
      this.onload();
    }
  };
  globalThis.fetch = async (url, options = {}) => {
    uploads.push({ url: String(url), body: JSON.parse(options.body) });
    return {
      ok: true,
      json: async () => ({
        reference: {
          id: "product-ref-server",
          title: "Упаковка",
          promptComment: "крупный фронтальный ракурс",
          imageName: "front.png",
          imageData: "https://s3.example.com/front.png",
          createdAt: "2026-06-29T00:00:00.000Z"
        }
      })
    };
  };

  try {
    const payload = await getProductReferencePayload(form, "product-1");

    assert.deepEqual(payload, {
      id: "product-ref-server",
      title: "Упаковка",
      promptComment: "крупный фронтальный ракурс",
      imageName: "front.png",
      imageData: "https://s3.example.com/front.png",
      createdAt: "2026-06-29T00:00:00.000Z"
    });
    assert.equal(uploads.length, 1);
    assert.equal(uploads[0].url, "/api/product-reference-assets");
    assert.equal(uploads[0].body.productId, "product-1");
    assert.equal(uploads[0].body.imageData, "data:image/png;base64,front.png");
    assert.deepEqual(resetCalls, ["reset"]);
  } finally {
    globalThis.FormData = originalFormData;
    globalThis.FileReader = originalFileReader;
    globalThis.fetch = originalFetch;
  }
});

test("product reference payload returns plain fields when file is absent", async () => {
  const originalFormData = globalThis.FormData;
  const form = {
    reset() {},
    querySelector() {
      return { files: [] };
    }
  };

  globalThis.FormData = class FakeFormData {
    constructor() {}
    entries() {
      return [["title", "Без файла"]][Symbol.iterator]();
    }
  };

  try {
    const payload = await getProductReferencePayload(form);
    assert.deepEqual(payload, { title: "Без файла" });
  } finally {
    globalThis.FormData = originalFormData;
  }
});
