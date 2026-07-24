import test from "node:test";
import assert from "node:assert/strict";
import { buildCreativeTeamImagePrompt } from "../src/domain/creative-team-image-prompt.js";

test("creative team image prompt enforces selected design reference fidelity", () => {
  const prompt = buildCreativeTeamImagePrompt({
    imagePromptPackage: { prompt: "Create vertical 9:16 infographic." },
    contentScript: {
      headline: "Скрип волос — сигнал",
      subhead: "Проверь рутину",
      points: ["Очищение сушит", "Уход смывается"]
    }
  }, {
    promptContract: {
      designReference: {
        title: "Воронка",
        structureName: "Секционная воронка-классификатор",
        formatType: "funnel_classifier",
        visualGrammar: {
          composition: "центральная многоцветная воронка",
          typography: "крупный serif headline"
        },
        adaptationRules: ["сохранить сегменты воронки"]
      }
    }
  });

  assert.match(prompt, /DESIGN REFERENCE FIDELITY GATE/);
  assert.match(prompt, /STYLE LOCK ВЫБРАННОГО РЕФЕРЕНСА/);
  assert.match(prompt, /Воронка/);
  assert.match(prompt, /Секционная воронка-классификатор/);
  assert.match(prompt, /центральная многоцветная воронка/);
  assert.match(prompt, /generic centered checklist/);
});
