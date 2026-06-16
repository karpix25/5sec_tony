import test from "node:test";
import assert from "node:assert/strict";
import { getProductReferencePayload } from "../src/ui/product.js";

test("product reference payload reads the first file as data url and resets the form", async () => {
  const originalFormData = globalThis.FormData;
  const originalFileReader = globalThis.FileReader;
  const resetCalls = [];
  const file = { name: "front.png" };
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

  try {
    const payload = await getProductReferencePayload(form);

    assert.deepEqual(payload, {
      title: "Упаковка",
      promptComment: "крупный фронтальный ракурс",
      imageName: "front.png",
      imageData: "data:image/png;base64,front.png"
    });
    assert.deepEqual(resetCalls, ["reset"]);
  } finally {
    globalThis.FormData = originalFormData;
    globalThis.FileReader = originalFileReader;
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
