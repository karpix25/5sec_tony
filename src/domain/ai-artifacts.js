const dataImagePattern = /^data:image\/(?:png|jpe?g|webp);base64,/i;

export function normalizeProductAiPassport(passport = null) {
  const source = asObject(passport);
  return pruneEmpty({
    version: source.version || "product-passport-v1",
    productName: source.productName || source.name || "",
    category: source.category || "",
    plainDescription: source.plainDescription || source.description || "",
    audience: asArray(source.audience),
    coreUseCases: asArray(source.coreUseCases),
    painSituations: asArray(source.painSituations),
    desires: asArray(source.desires),
    objections: asArray(source.objections),
    safeFacts: asArray(source.safeFacts),
    allowedClaims: asArray(source.allowedClaims),
    forbiddenClaims: asArray(source.forbiddenClaims),
    contentTerritory: asObject(source.contentTerritory),
    productVisibilityRules: asObject(source.productVisibilityRules),
    tone: source.tone || "",
    openQuestions: asArray(source.openQuestions),
    sourceHash: source.sourceHash || "",
    updatedAt: source.updatedAt || source.analyzedAt || ""
  });
}

export function normalizeDesignAnalysis(analysis = null) {
  const source = asObject(analysis);
  return pruneEmpty({
    version: source.version || "design-analysis-v1",
    formatType: source.formatType || "",
    structureName: source.structureName || "",
    layoutSlots: asArray(source.layoutSlots),
    textContract: asObject(source.textContract),
    visualGrammar: asObject(source.visualGrammar),
    background: source.background || source.visualGrammar?.background || "",
    typography: source.typography || source.visualGrammar?.typography || "",
    composition: source.composition || source.visualGrammar?.composition || "",
    elements: asArray(source.elements),
    adaptationRules: asArray(source.adaptationRules),
    doNotCopy: asArray(source.doNotCopy),
    ctaPolicy: source.ctaPolicy || "ignore-reference-cta",
    sourceImageUrl: dataImagePattern.test(String(source.sourceImageUrl || "")) ? "" : source.sourceImageUrl || "",
    sourceHash: source.sourceHash || "",
    analyzedAt: source.analyzedAt || source.updatedAt || ""
  });
}

export function hasUsefulProductPassport(passport) {
  const normalized = normalizeProductAiPassport(passport);
  return Boolean(normalized.productName || normalized.plainDescription || normalized.safeFacts?.length);
}

export function hasUsefulDesignAnalysis(analysis) {
  const normalized = normalizeDesignAnalysis(analysis);
  return Boolean(normalized.formatType || normalized.structureName || normalized.visualGrammar || normalized.layoutSlots?.length);
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  if (Array.isArray(value)) return value.filter((item) => item !== undefined && item !== null && item !== "");
  if (!value) return [];
  return String(value).split(/\n|;/).map((item) => item.trim()).filter(Boolean);
}

function pruneEmpty(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => {
    if (Array.isArray(item)) return item.length;
    if (item && typeof item === "object") return Object.keys(item).length;
    return item !== undefined && item !== null && item !== "";
  }));
}
