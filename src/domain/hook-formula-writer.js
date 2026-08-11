import { classifyHeadlineFormula, resolveHeadlineFormula } from "./headline-diversity.js";

export function writeHookFromFormula(template, context) {
  if (context.locked === true || context.headlineLocked === true) return String(template || "").trim();
  const diversity = resolveHeadlineFormula({
    headline: template,
    existingJobs: context.existingJobs,
    recentFormulas: context.recentFormulas || context.recentHeadlineFormulas,
    locked: false,
    maxConsecutive: context.maxConsecutiveFormula || 2
  });
  const shape = context.formula || diversity.formula;
  const count = context.count || "5";
  const focus = pickHookFocus([context.subject, context.object, context.scenario, context.result, context.problem]);
  const problem = cleanHookFocus(context.problem || focus);
  const result = cleanHookFocus(context.result || focus);
  const seed = `${template || ""} ${focus} ${problem} ${context.variantSeed || ""}`;

  const variants = {
    "red-flag": [
      `${count} красных флагов, которые стоит проверить заранее: ${focus}`,
      `${count} сигналов, что про ${focus} лучше узнать заранее`,
      `${count} моментов, где легко ошибиться: ${focus}`
    ],
    checklist: [
      `Что проверить заранее, если речь про ${focus}`,
      `${count} пунктов, которые стоит проверить перед выбором ${focus}`,
      `Короткая проверка перед тем как выбирать ${focus}`
    ],
    mistake: [
      `Ошибка, из-за которой ${problem} превращается в проблему`,
      `Что чаще всего ломает результат, когда речь про ${focus}`,
      `Неочевидная ошибка: ${focus}`
    ],
    "expectation-shift": [
      `Заблуждение про ${focus}, из-за которого легко ошибиться`,
      `Что про ${focus} кажется нормой, но часто подводит`,
      `Правда про ${focus}, которую обычно узнают поздно`
    ],
    curiosity: [
      `Почему ${problem} встречается чаще, чем кажется`,
      `Что на самом деле влияет на ${result}`,
      `Почему про ${focus} легко промахнуться`
    ],
    list: [
      `${count} деталей, которые меняют взгляд на ${focus}`,
      `Что стоит знать про ${focus} перед решением`,
      `Какие детали про ${focus} легко пропустить`
    ]
  };

  return pickFormulaVariant(variants[shape] || variants.list, seed);
}

export function classifyHookFormula(value) {
  return classifyHeadlineFormula(value);
}

function cleanHookFocus(value) {
  return String(value || "")
    .replace(/^(о|об|про|по теме:?)\s+/i, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .replace(/[:.!?]+$/g, "");
}

function pickHookFocus(values) {
  return values.map(cleanHookFocus).find((value) => value && !isWeakHookFocus(value))
    || "состав и ожидания";
}

function isWeakHookFocus(value) {
  return /^(это|непонятно|что-то|чего-то|польза|результат|детали?)$/i.test(value)
    || /^непонятно\b/i.test(value)
    || value.length < 5;
}

function pickFormulaVariant(items, seed) {
  const index = Math.abs(hashFormulaSeed(seed)) % items.length;
  return items[index];
}

function hashFormulaSeed(value) {
  return String(value || "").split("").reduce((sum, char) => ((sum << 5) - sum) + char.charCodeAt(0), 0);
}
