export const productPassportVersion = "product-passport-v3";

export const productWorldRules = [
  "Паспорт хранит только устойчивые факты о продукте: категорию, понятное описание, аудиторию, сценарии, боли, желания, возражения и безопасные факты.",
  "Не создавай карту тем, варианты заголовков, редакционные углы или список тем в паспорте: они выбираются заново для каждой генерации.",
  "Не придумывай свойства товара: safeFacts и allowedClaims остаются только из входных данных."
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
    productVisibilityRules: { showProductWhen: [], avoidProductWhen: [] },
    tone: "",
    openQuestions: []
  };
}
