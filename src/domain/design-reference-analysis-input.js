const largeMediaValuePattern = /^data:(?:image|video|audio)\//i;

export function createDesignReferenceAnalysisInput(body = {}) {
  return {
    reference: compactDesignReference(body.reference || {})
  };
}

function compactDesignReference(reference = {}) {
  return prunePlainObject({
    id: reference.id,
    type: reference.type,
    title: reference.title,
    layoutType: reference.layoutType,
    palette: reference.palette,
    avoidCopy: reference.avoidCopy,
    promptComment: reference.promptComment,
    takeaways: reference.takeaways,
    visualObject: reference.visualObject,
    textDensity: reference.textDensity,
    headlineStyle: reference.headlineStyle,
    fontStyle: reference.fontStyle,
    imageName: reference.imageName,
    status: reference.status,
    createdAt: reference.createdAt
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
  if (Array.isArray(value)) return value.map(compactValue).filter(Boolean).slice(0, 20);
  if (value && typeof value === "object") return prunePlainObject(value);
  if (typeof value === "string") return compactText(value);
  return value;
}

function compactText(value = "") {
  const text = String(value || "").trim();
  if (isLargeMediaValue(text)) return "";
  return text.length > 3000 ? `${text.slice(0, 3000)}...` : text;
}

function isLargeMediaValue(value = "") {
  return largeMediaValuePattern.test(String(value || "")) || String(value || "").length > 12000;
}
