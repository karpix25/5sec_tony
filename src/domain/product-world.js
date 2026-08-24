export const productPassportVersion = "product-passport-v2";

export const productWorldRules = [
  "Определи productWorld: более широкую человеческую область вокруг товара, а не его прямую функцию.",
  "Заполни contentTerritory как редакционную карту, а не список готовых заголовков.",
  "Дай 3-5 directProductTopics, 6-10 adjacentHelpfulTopics, 4-8 guidesAndRecommendations, 4-8 habitsAndMistakes и 3-6 lifestyleContexts.",
  "Смежные территории выводи из категории, задач аудитории и реальных сценариев использования: советы, гайды, ошибки, привычки, выбор, сезонность и образ жизни.",
  "Не своди все темы к одному очевидному свойству товара и не повторяй одну мысль разными словами.",
  "Не придумывай свойства товара: productWorld расширяет темы контента, но safeFacts и allowedClaims остаются только из входных данных."
];

export function createProductPassportShape() {
  return {
    version: productPassportVersion,
    productName: "",
    category: "",
    plainDescription: "",
    audience: [],
    coreUseCases: [],
    painSituations: [],
    desires: [],
    objections: [],
    safeFacts: [],
    allowedClaims: [],
    forbiddenClaims: [],
    contentTerritory: {
      productWorld: "",
      directProductTopics: [],
      adjacentHelpfulTopics: [],
      guidesAndRecommendations: [],
      habitsAndMistakes: [],
      lifestyleContexts: [],
      unsafeTopics: []
    },
    productVisibilityRules: { showProductWhen: [], avoidProductWhen: [] },
    tone: "",
    openQuestions: []
  };
}
