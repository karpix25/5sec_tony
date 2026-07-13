import test from "node:test";
import assert from "node:assert/strict";
import { renderProjectManagementSettings } from "../src/ui/project.js";
import { updateProductInFrameValue } from "../src/ui/project-range-controls.js";
import { FakeElement } from "./helpers/fake-ui-dom.mjs";

test("project text fields render object arrays as readable text", () => {
  const html = renderProjectManagementSettings({
    project: {
      name: "SONRE",
      yandexDiskFolder: "disk:/ВИДЕО/5сек/SONRE",
      companyAudience: [
        { segment: "Женщины 25-35", need: "хотят простую бьюти-рутину" },
        { segment: "Мамы", need: "ищут быстрый уход без сложных схем" }
      ],
      toneOfVoice: "",
      keyScenarios: "",
      audienceObjections: "",
      restrictions: ""
    }
  });

  assert.doesNotMatch(html, /\[object Object\]/);
  assert.match(html, /Женщины 25-35 — хотят простую бьюти-рутину/);
  assert.match(html, /Мамы — ищут быстрый уход без сложных схем/);
});

test("project text fields hide unicode replacement signs from saved text", () => {
  const html = renderProjectManagementSettings({
    project: {
      name: "SONRE",
      yandexDiskFolder: "disk:/ВИДЕО/5сек/SONRE",
      companyAudience: "Женщины 25-35",
      toneOfVoice: "",
      keyScenarios: "",
      audienceObjections: "Это просто мар��тинг, эффекта не будет",
      restrictions: ""
    }
  });

  assert.doesNotMatch(html, /\uFFFD/);
  assert.match(html, /Это просто мар/);
});

test("project settings expose product in frame percentage slider", () => {
  const html = renderProjectManagementSettings({
    project: {
      name: "SONRE",
      yandexDiskFolder: "disk:/ВИДЕО/5сек/SONRE",
      productInFramePercent: 45,
      companyAudience: "",
      toneOfVoice: "",
      keyScenarios: "",
      audienceObjections: "",
      restrictions: ""
    }
  });

  assert.match(html, /Продукт в кадре/);
  assert.match(html, /name="productInFramePercent"/);
  assert.match(html, /type="range"/);
  assert.match(html, /value="45"/);
  assert.match(html, /data-product-in-frame-input/);
  assert.match(html, /data-product-in-frame-value/);
});

test("project settings form scopes transient drafts to the project", () => {
  const html = renderProjectManagementSettings({
    project: {
      id: "project-sonre",
      name: "SONRE",
      yandexDiskFolder: "disk:/ВИДЕО/5сек/SONRE",
      companyAudience: "",
      toneOfVoice: "",
      keyScenarios: "",
      audienceObjections: "",
      restrictions: ""
    }
  });

  assert.match(html, /id="project-settings-form"/);
  assert.match(html, /data-transient-context="project:project-sonre"/);
});

test("product in frame percentage label updates while range changes", () => {
  const field = new FakeElement({ dataset: { productInFrameField: "" } });
  const input = new FakeElement({ value: "65", dataset: { productInFrameInput: "" } });
  const value = new FakeElement({ textContent: "30%", dataset: { productInFrameValue: "" } });
  field.append(input, value);

  updateProductInFrameValue(input);

  assert.equal(value.textContent, "65%");
});
