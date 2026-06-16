export function buildProductInsightMap({ insightMap } = {}) {
  const zones = normalizeBenefitZones(insightMap?.benefitZones);
  return {
    id: cleanInsightText(insightMap?.id),
    category: cleanInsightText(insightMap?.category),
    benefitZones: zones,
    painSituations: zones.map((zone) => zone.pain).filter(Boolean),
    connectedHabits: normalizeInsightList(insightMap?.connectedHabits || insightMap?.adjacentHabits),
    safeFacts: zones.map((zone) => zone.safeFact).filter(Boolean),
    visualAnchors: zones.map((zone) => zone.visual).filter(Boolean),
    contentQuestions: normalizeInsightList(insightMap?.contentQuestions)
  };
}

export function hasProductInsightMap(insightMap) {
  return Boolean(insightMap?.id || insightMap?.category || insightMap?.benefitZones?.length);
}

function normalizeBenefitZones(zones) {
  if (!Array.isArray(zones)) return [];
  return zones
    .map((zone, index) => ({
      id: cleanInsightText(zone?.id) || `zone-${index + 1}`,
      pain: cleanInsightText(zone?.pain),
      habit: cleanInsightText(zone?.habit),
      safeFact: cleanInsightText(zone?.safeFact),
      visual: cleanInsightText(zone?.visual)
    }))
    .filter((zone) => zone.pain || zone.habit || zone.safeFact)
    .slice(0, 5);
}

function normalizeInsightList(value) {
  const source = Array.isArray(value) ? value : String(value || "").split(/\n|;/);
  return source.map(cleanInsightText).filter(Boolean).slice(0, 8);
}

function cleanInsightText(value) {
  return String(value || "")
    .replace(/["'«»]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
