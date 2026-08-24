export function reviewRenderedImageText(expected = {}, observed = {}) {
  const expectedHeadline = normalizeImageTextLine(expected.headline);
  const observedHeadline = normalizeImageTextLine(observed.headline);
  const expectedSubhead = normalizeImageTextLine(expected.subhead);
  const observedSubhead = normalizeImageTextLine(observed.subhead);
  const expectedPoints = normalizePointList(expected.points);
  const observedPoints = normalizePointList(observed.points);
  const issues = [];

  if (expectedHeadline && expectedHeadline !== observedHeadline) issues.push("headline_mismatch");
  if (expectedSubhead && expectedSubhead !== observedSubhead) issues.push("subhead_mismatch");
  if (expectedPoints.length !== observedPoints.length || expectedPoints.some((point, index) => point !== observedPoints[index])) {
    issues.push("points_mismatch");
  }
  if (normalizePointList(observed.typos || observed.unreadableFragments).length) issues.push("rendered_text_errors");

  return {
    passed: issues.length === 0,
    issues,
    observed: {
      headline: String(observed.headline || "").trim(),
      subhead: String(observed.subhead || "").trim(),
      points: Array.isArray(observed.points) ? observed.points.map(formatPoint).filter(Boolean) : [],
      typos: normalizePointList(observed.typos || observed.unreadableFragments)
    }
  };
}

export function normalizeImageTextLine(value) {
  return formatPoint(value)
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePointList(value) {
  return (Array.isArray(value) ? value : value ? [value] : [])
    .map(normalizeImageTextLine)
    .filter(Boolean);
}

function formatPoint(point) {
  if (!point || typeof point !== "object") return String(point || "");
  return [point.rank, point.title, point.label, point.text, point.caption].filter(Boolean).join(" ");
}
