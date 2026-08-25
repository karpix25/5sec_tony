import test from "node:test";
import assert from "node:assert/strict";
import { createOperatorProductContext } from "../src/domain/operator-product-context.js";

test("operator product context keeps restrictions separate from facts and physical details", () => {
  const context = createOperatorProductContext({
    name: "Гель для душа",
    description: "Гель для ежедневного очищения кожи тела",
    pains: ["Хочется мягкого очищения после душа"],
    offer: "Комплекс AHA и BHA кислот",
    facts: "Без сульфатов",
    components: "Прозрачный гель во флаконе 250 мл",
    forbidden: "Не обещать лечение акне\nНе обещать медицинский эффект"
  });

  assert.equal(context.primaryPurpose.description, "Гель для ежедневного очищения кожи тела");
  assert.deepEqual(context.primaryPurpose.audienceTasks, ["Хочется мягкого очищения после душа"]);
  assert.equal(context.supportingFacts.offer, "Комплекс AHA и BHA кислот");
  assert.equal(context.physicalProperties, "Прозрачный гель во флаконе 250 мл");
  assert.deepEqual(context.hardRestrictions, ["Не обещать лечение акне", "Не обещать медицинский эффект"]);
});
