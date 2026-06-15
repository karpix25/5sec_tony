export const scenarioPatterns = [
  {
    id: "red-flag",
    format: "comparison",
    hook: "Не путайте норму и красный флаг",
    topic: "Как отличить нормальную ситуацию от тревожного сигнала",
    visualObject: "две колонки: норма против красного флага",
    planShape: "норма -> красный флаг -> что проверить -> следующий шаг"
  },
  {
    id: "hidden-mistake",
    format: "mistake-solution",
    hook: "Одна маленькая ошибка может стоить результата",
    topic: "Какая неочевидная ошибка ломает результат",
    visualObject: "контраст ошибка -> правильный шаг",
    planShape: "ошибка -> почему опасно -> как заметить -> как исправить"
  },
  {
    id: "before-check",
    format: "checklist",
    hook: "Не делайте это, пока не проверите 3 пункта",
    topic: "Что проверить перед действием",
    visualObject: "чеклист с 3-5 крупными пунктами",
    planShape: "проверка -> риск -> критерий -> решение"
  },
  {
    id: "classification",
    format: "symptoms",
    hook: "Вы думаете, это норма? Проверьте по этим признакам",
    topic: "Какие признаки помогают понять ситуацию",
    visualObject: "визуальная классификация состояний",
    planShape: "признак -> что значит -> чем грозит -> что делать"
  },
  {
    id: "myth-reality",
    format: "comparison",
    hook: "Вы верите в миф, который мешает результату",
    topic: "Как популярный миф мешает принять решение",
    visualObject: "миф против реальности",
    planShape: "миф -> реальность -> доказуемый факт -> безопасный вывод"
  },
  {
    id: "metaphor",
    format: "scheme",
    hook: "Вот где обычно все застревает",
    topic: "Как простая метафора объясняет проблему",
    visualObject: "метафорический объект с выносками",
    planShape: "метафора -> боль -> причина -> действие"
  }
];

export const viralTextRules = [
  "один экран — одна мысль",
  "хук читается за 1 секунду",
  "короткие рубленые фразы без воды",
  "сначала боль или конфликт, потом объяснение",
  "визуал: классификация, сравнение, метафора или чеклист",
  "не обещать то, что запрещено ограничениями проекта"
];

export function pickScenarioPattern({ project, existingJobs = [] }) {
  const explicit = findExplicitPattern(project);
  const used = new Set(existingJobs.map((job) => job.meaningPatternId || job.semanticKey || ""));
  const pool = explicit ? [explicit, ...scenarioPatterns.filter((item) => item.id !== explicit.id)] : scenarioPatterns;
  return pool.find((pattern) => !used.has(pattern.id)) || pool[existingJobs.length % pool.length];
}

export function getPatternInstruction(pattern) {
  return [
    `Сценарный паттерн: ${pattern.id}.`,
    `Структура: ${pattern.planShape}.`,
    `Визуальный формат: ${pattern.visualObject}.`,
    `Правила текста: ${viralTextRules.join("; ")}.`
  ].join(" ");
}

function findExplicitPattern(project) {
  const source = `${project.allowedTriggers || ""} ${project.keyScenarios || ""}`.toLowerCase();
  if (/красн|флаг|опасн/.test(source)) return scenarioPatterns.find((item) => item.id === "red-flag");
  if (/ошиб/.test(source)) return scenarioPatterns.find((item) => item.id === "hidden-mistake");
  if (/чеклист|провер/.test(source)) return scenarioPatterns.find((item) => item.id === "before-check");
  if (/признак|симптом|тип|классиф/.test(source)) return scenarioPatterns.find((item) => item.id === "classification");
  if (/миф/.test(source)) return scenarioPatterns.find((item) => item.id === "myth-reality");
  return null;
}
