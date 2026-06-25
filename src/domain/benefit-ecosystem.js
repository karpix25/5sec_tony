export function createBenefitEcosystem({ project, product } = {}) {
  const goal = firstText([
    product?.offer,
    project?.audienceDesires,
    product?.description,
    project?.projectTheme,
    project?.niche,
    product?.name
  ]) || "полезный результат для аудитории";
  return {
    id: "ai-generated-benefit-ecosystem",
    goal,
    sourceSignals: uniqueEcosystemSignals([
      project?.projectTheme,
      project?.niche,
      project?.keyScenarios,
      project?.audiencePains,
      project?.audienceDesires,
      product?.name,
      product?.description,
      product?.offer,
      product?.components,
      product?.pains,
      product?.facts
    ])
  };
}

export function getBenefitEcosystemSubjects() {
  return [];
}

export function formatBenefitEcosystemInstruction(input) {
  const ecosystem = createBenefitEcosystem(input);
  return [
    `Большая цель за продуктом: ${ecosystem.goal}.`,
    ecosystem.sourceSignals.length ? `Сигналы из брифа: ${ecosystem.sourceSignals.join("; ")}.` : "",
    "Соседние темы, привычки, проверки, ошибки и жизненные ситуации не заданы в коде.",
    "AI-команда должна сгенерировать их сама из брифа продукта, ЦА, истории последних роликов и выбранного формата.",
    "Не используй готовые примеры из системного кода как тему, headline, subhead или пункт."
  ].filter(Boolean).join(" ");
}

function uniqueEcosystemSignals(values) {
  const seen = new Set();
  return values
    .flatMap(splitSignalValue)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => {
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 12);
}

function splitSignalValue(value) {
  if (Array.isArray(value)) return value.flatMap(splitSignalValue);
  return String(value || "").split(/\n|;/).filter(Boolean);
}

function firstText(values) {
  return values.flatMap(splitSignalValue).map((item) => item.trim()).find(Boolean);
}
