const ecosystems = [
  {
    id: "beauty-skin",
    test: /красот|кожа|космет|крем|сыворот|уход|spf|гиалурон|коллаген|тон|массаж/i,
    goal: "красота, состояние кожи и регулярный уход",
    adjacentActions: ["массаж зоны ухода", "мягкое очищение", "SPF", "сон", "вода", "снижение стресса", "привычка не трогать кожу", "регулярность нанесения"],
    questions: ["Что влияет на кожу кроме косметики?", "Какой простой уходовый ритуал усиливает ту же цель?", "Какая бытовая привычка мешает результату?"]
  },
  {
    id: "health-routine",
    test: /здоров|wellness|бад|витамин|хлорофилл|магни|сон|энерг|самочув|вода|стресс/i,
    goal: "здоровье, энергия и устойчивое самочувствие",
    adjacentActions: ["легкая физкультура", "прогулка", "утренний стакан воды", "сон и режим", "дыхание", "питание без перегруза", "полезная привычка"],
    questions: ["Что еще помогает той же цели без покупки?", "Какая привычка поддерживает энергию в обычном дне?", "Где продукт может быть только частью рутины?"]
  }
];

export function createBenefitEcosystem({ project, product } = {}) {
  const source = [
    project?.projectTheme,
    project?.niche,
    project?.audiencePains,
    project?.audienceDesires,
    product?.name,
    product?.description,
    product?.offer,
    product?.components,
    ...(product?.pains || []),
    ...(product?.facts || [])
  ].filter(Boolean).join(" ");
  const matched = ecosystems.find((item) => item.test.test(source));
  if (matched) return matched;
  return {
    id: "general-benefit",
    goal: product?.offer || project?.audienceDesires || project?.projectTheme || "полезный результат для человека",
    adjacentActions: ["бытовая привычка", "простая проверка", "регулярность", "контекст применения", "ошибка ожиданий"],
    questions: ["Какая соседняя привычка ведет к той же цели?", "Что полезно человеку даже без покупки?"]
  };
}

export function getBenefitEcosystemSubjects(input) {
  const ecosystem = createBenefitEcosystem(input);
  return ecosystem.adjacentActions.map((action) => `${action}: ${ecosystem.goal}`);
}

export function formatBenefitEcosystemInstruction(input) {
  const ecosystem = createBenefitEcosystem(input);
  return [
    `Большая цель за продуктом: ${ecosystem.goal}.`,
    `Соседние действия и привычки: ${ecosystem.adjacentActions.join(", ")}.`,
    `Вопросы для расширения темы: ${ecosystem.questions.join(" ")}.`,
    "Контент может идти через соседний полезный шаг; продукт остается мягким мостом, а не рамкой всей темы."
  ].join(" ");
}
