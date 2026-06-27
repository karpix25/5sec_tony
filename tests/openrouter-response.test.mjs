import test from "node:test";
import assert from "node:assert/strict";
import { parseJsonDraft } from "../scripts/openrouter-response.mjs";

test("OpenRouter draft parser repairs missing commas between array objects", () => {
  const draft = parseJsonDraft(`
    {
      "designAnalysis": {
        "structure": {
          "elements": [
            {"type": "headline"}
            {"type": "chart"}
          ]
        }
      }
    }
  `);

  assert.deepEqual(draft.designAnalysis.structure.elements, [
    { type: "headline" },
    { type: "chart" }
  ]);
});

test("OpenRouter draft parser repairs missing commas between array strings and trailing commas", () => {
  const draft = parseJsonDraft(`
    \`\`\`json
    {
      "points": [
        "фон"
        "сетка"
        "типографика",
      ],
      "title": "Дизайн",
    }
    \`\`\`
  `);

  assert.deepEqual(draft.points, ["фон", "сетка", "типографика"]);
  assert.equal(draft.title, "Дизайн");
});

test("OpenRouter draft parser hides technical parse positions from users", () => {
  assert.throws(
    () => parseJsonDraft("{\"items\": [\"фон\", invalid]}"),
    /AI-команда вернула черновик в неправильном формате/
  );
  assert.doesNotThrow(() => parseJsonDraft("{\"items\": [\"фон\", invalid]}", { strict: false }));
});
