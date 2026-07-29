import test from "node:test";
import assert from "node:assert/strict";
import { buildCreativeTeamImagePrompt } from "../src/domain/creative-team-image-prompt.js";
import { createPromptContract } from "../src/domain/prompt-contract.js";

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
        safeZoneAdaptation: {
          bottomRisk: "подписи референса близко к нижнему краю",
          rightRailRisk: "правые карточки заходят в rail",
          remapPlan: ["сжать воронку внутрь x=150..830", "оставить низ только фоном"],
          decorativeOnlyZones: ["нижние 30%", "правый rail"]
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
  assert.match(prompt, /safe-zone adaptation/);
  assert.match(prompt, /оставить низ только фоном/);
  assert.match(prompt, /правый rail/);
  assert.match(prompt, /generic centered checklist/);
});

test("prompt contract carries design safe-zone analysis into image prompt", () => {
  const promptContract = createPromptContract({
    brief: {
      designFormatBrief: {
        safeZoneAdaptation: {
          edgePressure: "низ перегружен текстом",
          remapPlan: ["перенести CTA-карточку выше"],
          decorativeOnlyZones: ["нижние 30%"]
        }
      }
    },
    reference: { title: "Воронка" }
  });

  const prompt = buildCreativeTeamImagePrompt({
    imagePromptPackage: { prompt: "Create vertical 9:16 infographic." }
  }, { promptContract });

  assert.match(prompt, /safe-zone adaptation/);
  assert.match(prompt, /низ перегружен текстом/);
  assert.match(prompt, /перенести CTA-карточку выше/);
});
