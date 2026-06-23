const hookTypeRules = [
  {
    id: "collection",
    test: /n\s+обязательн|n\s+лучш|количество|полезн.+продукт|приложен|книг/i,
    mechanism: "FOMO и сохранение подборки",
    structure: "saveable-collection",
    promise: "зритель получит короткую подборку, которую можно сохранить"
  },
  {
    id: "surprise-fact",
    test: /не поверите|секрет|а вы знали|оказалось/i,
    mechanism: "неожиданный факт и curiosity gap",
    structure: "fact-card",
    promise: "зритель узнает факт, который меняет привычное объяснение"
  },
  {
    id: "experiment",
    test: /после месяца|я .*за вас|я купила|чтобы вам не пришлось|часть n/i,
    mechanism: "личный тест и экономия ошибки зрителя",
    structure: "ugc-proof",
    promise: "зритель увидит вывод из чужого опыта"
  },
  {
    id: "diagnosis",
    test: /почему твой|если твое|если у тебя|признак/i,
    mechanism: "диагностика знакомой проблемы",
    structure: "symptoms",
    promise: "зритель узнает себя по признакам"
  },
  {
    id: "anti-advice",
    test: /причин[а-я\s]+не|хватит|не делайте|перестал/i,
    mechanism: "антисовет и защита от ошибки",
    structure: "mistake-check",
    promise: "зритель поймет, какую ошибку не повторять"
  },
  {
    id: "insider",
    test: /если вы развиваетесь|важный совет|вам необходимо|лучшим другом/i,
    mechanism: "инсайдерский совет и экспертное сокращение пути",
    structure: "mentor-note",
    promise: "зритель получит совет, который обычно узнают поздно"
  },
  {
    id: "visual-curiosity",
    test: /как выглядит самый|сейчас.*покажу/i,
    mechanism: "визуальное любопытство",
    structure: "visual-proof",
    promise: "зритель увидит конкретный объект или ситуацию"
  }
];

export function createHookIntelligence(sourceHook = "") {
  const text = String(sourceHook || "").trim();
  const matched = hookTypeRules.find((rule) => rule.test.test(text)) || {
    id: "curiosity",
    mechanism: "узнаваемая ситуация и открытый вопрос",
    structure: "saveable-note",
    promise: "зритель получит полезное объяснение без прямой рекламы"
  };
  return {
    sourceHook: text,
    hookType: matched.id,
    attentionMechanism: matched.mechanism,
    expectedStructure: matched.structure,
    hookPromise: matched.promise,
    badAdaptations: getBadAdaptations(matched.id)
  };
}

export function formatHookIntelligencePrompt(intelligence) {
  if (!intelligence?.sourceHook) return "";
  return [
    "ВНУТРЕННЕЕ ПРАВИЛО ХУКА: это инструкция для смысла, не писать эти слова на изображении.",
    `Исходный хук из библиотеки: ${intelligence.sourceHook}.`,
    `Тип хука: ${intelligence.hookType}.`,
    `Механика внимания: ${intelligence.attentionMechanism}.`,
    `Обещание зрителю: ${intelligence.hookPromise}.`,
    `Ожидаемая структура: ${intelligence.expectedStructure}.`,
    `Плохие адаптации: ${intelligence.badAdaptations.join("; ")}.`,
    "Адаптируй хук по его психологии, а не механически подставляй название продукта."
  ].join(" ");
}

function getBadAdaptations(type) {
  const common = [
    "механическая подстановка продукта",
    "общий совет без конкретной ситуации",
    "одинаковая формула '3 ошибки' для любого хука"
  ];
  const byType = {
    collection: ["подборка без критерия отбора", "список вещей из разных тем"],
    "surprise-fact": ["факт без неожиданности", "заголовок, который можно поставить в любую нишу"],
    experiment: ["вывод без личного наблюдения", "результат с выдуманной цифрой"],
    diagnosis: ["признаки без узнаваемой боли", "страшилка вместо проверки"],
    "anti-advice": ["атака на продукт", "формулировка 'продукт не работает'"],
    insider: ["менторский совет без конкретного действия"],
    "visual-curiosity": ["визуальный объект, не связанный с темой"]
  };
  return [...common, ...(byType[type] || [])];
}
