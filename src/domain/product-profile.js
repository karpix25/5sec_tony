function asLines(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  return String(value || "").split(/\n|;/).map((item) => item.trim()).filter(Boolean);
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function first(items) {
  return items.find(Boolean) || "";
}

export function buildProductProfile({ project, product }) {
  const useCases = unique([
    ...asLines(product.useCases),
    ...asLines(product.pains)
  ]);
  const proofPoints = unique([
    ...asLines(product.proofPoints),
    ...asLines(product.facts)
  ]);
  const visualAnchors = unique([
    ...asLines(product.visualAnchors),
    ...asLines(product.components)
  ]);
  const audienceSignals = unique([
    ...asLines(project.audiencePains),
    ...asLines(project.audienceDesires),
    ...asLines(project.keyScenarios)
  ]);
  const painMap = unique([
    ...asLines(product.pains),
    ...audienceSignals
  ]);
  const safeClaims = unique([
    ...asLines(product.offer),
    ...asLines(product.safeClaims)
  ]);
  const forbiddenClaims = unique([
    ...asLines(product.forbidden),
    ...asLines(project.forbiddenTriggers),
    ...asLines(project.contentRestrictions),
    ...asLines(project.restrictions)
  ]);

  return {
    productName: product.name,
    description: product.description || "",
    useCases,
    proofPoints,
    visualAnchors,
    painMap,
    audienceSignals,
    safeClaims,
    forbiddenClaims,
    primaryUseCase: first(useCases) || first(painMap) || product.name,
    primaryPain: first(painMap) || product.name,
    primaryProof: first(proofPoints) || product.description || product.name,
    primaryVisual: first(visualAnchors) || product.name
  };
}
