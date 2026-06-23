const rankingPattern = /ranking[_-]?leaderboard|leaderboard|top[- ]?chart|top\s*\d+|топ\s*\d+|рейтинг|ранг|rank|мест[ао]|value label/i;

export function getReferenceFormatSignal(reference = {}) {
  const source = [
    reference.layoutType,
    reference.title,
    reference.promptComment,
    reference.takeaways,
    reference.avoidCopy,
    reference.visualObject,
    reference.textDensity,
    reference.headlineStyle,
    reference.fontStyle,
    reference.palette,
    reference.imageName
  ].filter(Boolean).join(" ");

  if (rankingPattern.test(source)) return "ranking_leaderboard";
  return "";
}

export function getReferenceFormatSource(reference = {}) {
  return [
    getReferenceFormatSignal(reference),
    reference.layoutType,
    reference.id,
    reference.title,
    reference.promptComment,
    reference.takeaways,
    reference.avoidCopy,
    reference.visualObject,
    reference.textDensity,
    reference.headlineStyle,
    reference.fontStyle,
    reference.palette,
    reference.imageName
  ].filter(Boolean).join(" ");
}

export function resolveGenerationFormat({ reference, requestedFormat, candidateFormat, lockedFormat, fallbackFormat }) {
  return getReferenceFormatSignal(reference) || requestedFormat || candidateFormat || lockedFormat || fallbackFormat || "";
}

export function resolvePointCountForFormat({ format, requested, hookCount, product }) {
  if (format === "ranking_leaderboard") return "12";
  return hookCount || requested || pickDefaultPointCount(product);
}

function pickDefaultPointCount(product = {}) {
  const count = Math.max(product.pains?.length || 0, product.facts?.length || 0);
  return String(Math.min(6, Math.max(4, count || 5)));
}
