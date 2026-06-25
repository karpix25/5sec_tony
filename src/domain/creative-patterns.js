export const scenarioPatterns = [
  {
    id: "red-flag",
    format: "comparison",
    hook: "",
    topic: "",
    visualObject: "две колонки: норма против красного флага",
    planShape: "норма -> красный флаг -> что проверить -> следующий шаг"
  },
  {
    id: "hidden-mistake",
    format: "mistake-solution",
    hook: "",
    topic: "",
    visualObject: "контраст ошибка -> правильный шаг",
    planShape: "ошибка -> почему опасно -> как заметить -> как исправить"
  },
  {
    id: "decision-check",
    format: "decision-map",
    hook: "",
    topic: "",
    visualObject: "карта решения с короткими выносками",
    planShape: "ситуация -> риск -> критерий -> спокойное решение"
  },
  {
    id: "classification",
    format: "symptoms",
    hook: "",
    topic: "",
    visualObject: "визуальная классификация состояний",
    planShape: "признак -> что значит -> чем грозит -> что делать"
  },
  {
    id: "expectation-shift",
    format: "expectation-shift",
    hook: "",
    topic: "",
    visualObject: "контраст ожидания и проверяемой детали",
    planShape: "ожидание -> реальная деталь -> что это меняет -> безопасный вывод"
  },
  {
    id: "metaphor",
    format: "scheme",
    hook: "",
    topic: "",
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
  if (/чеклист|провер/.test(source)) return scenarioPatterns.find((item) => item.id === "decision-check");
  if (/признак|симптом|тип|классиф/.test(source)) return scenarioPatterns.find((item) => item.id === "classification");
  if (/миф|ожидан/.test(source)) return scenarioPatterns.find((item) => item.id === "expectation-shift");
  return null;
}
