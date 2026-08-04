import test from "node:test";
import assert from "node:assert/strict";
import { normalizeAiBrief } from "../src/domain/ai-brief-normalizer.js";
import { createCreativeTeamPayload } from "../src/domain/creative-team-payload.js";
import { sanitizeTextTree } from "../src/domain/text-integrity.js";

test("text integrity removes replacement characters from nested values", () => {
  assert.deepEqual(sanitizeTextTree({ title: "Пла��и", nested: ["Описан�ие"] }), { title: "Плаи", nested: ["Описание"] });
});

test("creative team payload and normalized brief never pass replacement characters", () => {
  const payload = createCreativeTeamPayload({ product: { name: "Масса��ёр" }, project: { name: "Проект�" }, reference: { title: "Референс��" } });
  const brief = normalizeAiBrief({ cta: "ЧИТА�� ОПИСАН��", contentScript: { headline: "Заголовок�", points: ["Пункт��"] } });
  assert.doesNotMatch(JSON.stringify(payload), /\uFFFD/);
  assert.doesNotMatch(JSON.stringify(brief), /\uFFFD/);
});
