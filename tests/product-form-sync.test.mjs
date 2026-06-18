import test from "node:test";
import assert from "node:assert/strict";
import { syncProductDraftToFieldsModal } from "../src/ui/product-form-sync.js";

const realFormData = globalThis.FormData;

test("opening product fields modal uses live draft values from the current form", () => {
  globalThis.FormData = class MockFormData {
    constructor(form) {
      this.entriesList = Object.entries(form.__draft || {});
    }

    entries() {
      return this.entriesList[Symbol.iterator]();
    }
  };

  const title = { textContent: "Хлорофил" };
  const controls = {
    description: { value: "старое описание" },
    pains: { value: "старая боль" },
    offer: { value: "старая роль" },
    facts: { value: "старый факт" },
    forbidden: { value: "старый запрет" }
  };
  const modal = {
    querySelector(selector) {
      if (selector === ".panel-head h2") return title;
      const match = selector.match(/^\[name="(.+)"\]$/);
      return match ? controls[match[1]] : null;
    }
  };
  const form = {
    __draft: {
      name: "Магний вечерний",
      description: "новое описание",
      pains: "новая боль",
      offer: "новая роль",
      facts: "новый факт",
      forbidden: "новый запрет"
    }
  };
  const root = {
    querySelector(selector) {
      if (selector === "#product-settings-form") return form;
      if (selector === "#product-fields-modal") return modal;
      return null;
    }
  };

  syncProductDraftToFieldsModal(root);

  assert.equal(title.textContent, "Магний вечерний");
  assert.equal(controls.description.value, "новое описание");
  assert.equal(controls.pains.value, "новая боль");
  assert.equal(controls.offer.value, "новая роль");
  assert.equal(controls.facts.value, "новый факт");
  assert.equal(controls.forbidden.value, "новый запрет");

  globalThis.FormData = realFormData;
});
