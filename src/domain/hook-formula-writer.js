export function writeHookFromFormula(template, context) {
  const shape = classifyHookFormula(template);
  const count = context.count || "5";
  const focus = cleanHookFocus(context.subject || context.object || context.scenario || "это");
  const problem = cleanHookFocus(context.problem || focus);
  const result = cleanHookFocus(context.result || focus);
  const seed = `${template || ""} ${focus} ${problem} ${context.variantSeed || ""}`;

  const variants = {
    "red-flag": [
      `${count} тревожных признаков, когда речь про ${focus}`,
      `${count} сигналов, что ${focus} стоит проверить заранее`,
      `${count} деталей вокруг ${focus}, которые лучше заметить до решения`
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
    "myth-reality": [
      `Миф о ${focus}, из-за которого легко ошибиться`,
      `Что в ${focus} кажется нормой, но часто подводит`,
      `Правда о ${focus}, которую обычно узнают поздно`
    ],
    curiosity: [
      `Почему ${problem} встречается чаще, чем кажется`,
      `Что на самом деле влияет на ${result}`,
      `Почему с ${focus} легко промахнуться`
    ],
    list: [
      `${count} вещей, которые стоит знать про ${focus}`,
      `${count} деталей, которые меняют взгляд на ${focus}`,
      `${count} пунктов про ${focus}, которые лучше сохранить`
    ]
  };

  return pickFormulaVariant(variants[shape] || variants.list, seed);
}

export function classifyHookFormula(value) {
  const source = String(value || "").toLowerCase();
  if (/красн|флаг|опасн|риск/.test(source)) return "red-flag";
  if (/ошиб|стоить|лома|не делайте/.test(source)) return "mistake";
  if (/миф|правд|реальн|норма/.test(source)) return "myth-reality";
  if (/проверь|чек|пункт|признак/.test(source)) return "checklist";
  if (/почему|зачем|что будет/.test(source)) return "curiosity";
  return "list";
}

function cleanHookFocus(value) {
  return String(value || "")
    .replace(/^(о|об|про|по теме:?)\s+/i, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .replace(/[:.!?]+$/g, "");
}

function pickFormulaVariant(items, seed) {
  const index = Math.abs(hashFormulaSeed(seed)) % items.length;
  return items[index];
}

function hashFormulaSeed(value) {
  return String(value || "").split("").reduce((sum, char) => ((sum << 5) - sum) + char.charCodeAt(0), 0);
}
