const operatorProductContextRules = [
  "operatorProductContext — прямой контракт из полей, заполненных оператором. Это не AI-пересказ и не материал для свободной интерпретации.",
  "hardRestrictions обязательны для всех этапов и важнее productPassport, креативной идеи и желания сделать тему громче.",
  "Тему выбирай из primaryPurpose и audienceTasks. supportingFacts доказывают связь с продуктом, а physicalProperties не становятся самостоятельной темой, если сам товар не относится к этой категории.",
  "Не превращай боли, желания и сценарии в медицинские причины, диагнозы, механизмы или обещания результата."
];

export { operatorProductContextRules };

export function createOperatorProductContext(product = {}) {
  return {
    source: "operator_product_fields",
    primaryPurpose: {
      productName: clean(product.name),
      description: clean(product.description),
      audienceTasks: asLines(product.pains)
    },
    supportingFacts: {
      offer: clean(product.offer),
      competitorProblems: asLines(product.facts),
      allowed: asLines(product.allowed)
    },
    physicalProperties: clean(product.components),
    hardRestrictions: asLines(product.forbidden)
  };
}

function asLines(value) {
  if (Array.isArray(value)) return value.flatMap(asLines);
  return String(value || "")
    .split(/[\n;]/)
    .map(clean)
    .filter(Boolean);
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}
