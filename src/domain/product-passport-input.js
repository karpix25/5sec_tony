const largeMediaValuePattern = /^data:(?:image|video|audio)\//i;

export function createProductPassportInput(body = {}) {
  return {
    product: compactProductForProductPassport(body.product || {})
  };
}

function compactProductForProductPassport(product = {}) {
  return prunePlainObject({
    id: product.id,
    name: product.name,
    description: product.description,
    offer: product.offer,
    audience: product.audience,
    pains: product.pains,
    facts: product.facts,
    components: product.components,
    objections: product.objections,
    forbidden: product.forbidden,
    allowed: product.allowed,
    useCases: product.useCases,
    purchaseReasons: product.purchaseReasons,
    competitorNegatives: product.competitorNegatives,
    physicalProperties: product.physicalProperties
  });
}

function prunePlainObject(value = {}) {
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, compactValue(item)]).filter(([, item]) => {
    if (Array.isArray(item)) return item.length;
    if (item && typeof item === "object") return Object.keys(item).length;
    return item !== undefined && item !== null && item !== "";
  }));
}

function compactValue(value) {
  if (Array.isArray(value)) return value.map(compactValue).filter(Boolean).slice(0, 30);
  if (value && typeof value === "object") return prunePlainObject(value);
  if (typeof value === "string") return compactText(value);
  return value;
}

function compactText(value = "") {
  const text = String(value || "").trim();
  if (isLargeMediaValue(text)) return "";
  return text.length > 4000 ? `${text.slice(0, 4000)}...` : text;
}

function isLargeMediaValue(value = "") {
  return largeMediaValuePattern.test(String(value || "")) || String(value || "").length > 12000;
}
