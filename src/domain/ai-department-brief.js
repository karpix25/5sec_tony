import { normalizeHumanizedLine, normalizeHumanizedPlan } from "./text-humanizer.js";

export function hasAiDepartmentBrief(brief = {}) {
  return Boolean(
    brief.imagePromptPackage?.prompt
    || brief.contentScript?.headline
    || brief.creativeBrief?.topic
    || brief.visualBrief?.composition
    || brief.productPassport
  );
}

export function getAiDepartmentContent(brief = {}) {
  const content = brief.contentScript || brief.plan || brief.aiPlan || {};
  const plan = normalizeHumanizedPlan({
    headline: cleanAiText(content.headline || brief.hook || brief.recommendedHook),
    subhead: cleanAiText(content.subhead),
    points: Array.isArray(content.points) ? content.points.map(formatAiPoint).filter(Boolean) : [],
    disclaimer: ""
  }, { headline: "", subhead: "", points: [], disclaimer: "" });
  return plan;
}

export function getAiDepartmentTopic(brief = {}) {
  return normalizeHumanizedLine(brief.topic || brief.creativeBrief?.topic || brief.contentScript?.headline || brief.hook || brief.recommendedHook);
}

export function getAiDepartmentHook(brief = {}) {
  return normalizeHumanizedLine(brief.hook || brief.recommendedHook || brief.sourceHook || brief.hookSet?.[0]?.hook || brief.contentScript?.headline);
}

export function getAiDepartmentFormat(brief = {}, fallback = "") {
  return cleanAiText(brief.format || brief.designFormatBrief?.formatType || brief.creativeBrief?.formatIntent || fallback);
}

export function getAiDepartmentVisualObject(brief = {}, fallback = "") {
  return cleanAiText(brief.visualObject || brief.visualBrief?.mainVisualObject || fallback);
}

export function getAiDepartmentPointCount(brief = {}, fallback = "") {
  const content = getAiDepartmentContent(brief);
  return String(brief.pointCount || content.points.length || fallback || "");
}

function formatAiPoint(point) {
  if (!point || typeof point !== "object") return cleanAiText(point);
  return cleanAiText([point.rank, point.title, point.label, point.text, point.caption].filter(Boolean).join(": "));
}

function cleanAiText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}
