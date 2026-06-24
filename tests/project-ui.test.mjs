import test from "node:test";
import assert from "node:assert/strict";
import { renderProjectManagementSettings } from "../src/ui/project.js";

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
