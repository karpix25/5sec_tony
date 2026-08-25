import { stripUnicodeReplacementCharacters } from "./text-integrity.js";

const creativeTeamPayloadDataImagePattern = /^data:image\/(?:png|jpe?g|webp);base64,/i;

export function createCreativeTeamPayload(body = {}) {
  const source = { ...body };
  delete source.topicCluster;
  delete source.topicClusterPlan;
  const reference = compactReference(source.reference);
  const includeProductReferences = source.productVisibilityDecision
    ? source.productVisibilityDecision.shouldPassProductRefs === true
    : true;
  return {
    ...source,
    project: compactProject(source.project),
    product: compactProduct(source.product, { includeReferences: includeProductReferences }),
    reference,
    activeDesignReference: compactActiveDesignReference(source.activeDesignReference || reference),
    layoutContentPlan: sanitizeValue(source.layoutContentPlan || null),
    existingJobs: sanitizeValue(Array.isArray(source.existingJobs) ? source.existingJobs : []),
    recentAttentionFrames: sanitizeValue(Array.isArray(source.recentAttentionFrames) ? source.recentAttentionFrames : []),
    availableAvatarEmotions: sanitizeValue(source.availableAvatarEmotions || []),
    diversitySlot: sanitizeValue(source.diversitySlot || null)
  };
}

function compactProject(project = {}) {
  return pickPlain(project, [
    "id",
    "name",
    "client",
    "companyInfo",
    "companyAudience",
    "projectTheme",
    "niche",
    "keyScenarios",
    "audiencePains",
    "audienceDesires",
    "audienceObjections",
    "allowedTriggers",
    "forbiddenTriggers",
    "hookAggression",
    "contentRestrictions",
    "toneOfVoice",
    "restrictions",
    "style"
  ], {
    references: (project.references || []).map(compactReference)
  });
}

function compactProduct(product = {}, { includeReferences = true } = {}) {
  return pickPlain(product, [
    "id",
    "projectId",
    "name",
    "description",
    "offer",
    "components",
    "pains",
    "facts",
    "forbidden",
    "aiPassport"
  ], {
    references: includeReferences ? (product.references || []).map(compactReference) : []
  });
}

function compactReference(reference = {}) {
  const imageUrl = getReferenceImageUrl(reference);
  return pickPlain(reference, [
    "id",
    "type",
    "title",
    "layoutType",
    "palette",
    "avoidCopy",
    "promptComment",
    "takeaways",
    "visualObject",
    "textDensity",
    "headlineStyle",
    "fontStyle",
    "imageName",
    "status",
    "createdAt",
    "designAnalysis"
  ], {
    imageUrl,
    hasImage: Boolean(reference.imageData || reference.imageUrl || imageUrl)
  });
}

function compactActiveDesignReference(reference = {}) {
  return pickPlain(reference, [
    "id",
    "title",
    "layoutType",
    "visualObject",
    "promptComment",
    "takeaways",
    "avoidCopy",
    "textDensity",
    "headlineStyle",
    "fontStyle",
    "imageName",
    "palette",
    "designAnalysis"
  ], {
    imageUrl: getReferenceImageUrl(reference),
    hasImage: Boolean(reference.imageData || reference.imageUrl)
  });
}

function pickPlain(source = {}, keys = [], extra = {}) {
  return Object.fromEntries([
    ...keys.map((key) => [key, sanitizeValue(source[key])]),
    ...Object.entries(extra).map(([key, value]) => [key, sanitizeValue(value)])
  ].filter(([, value]) => value !== undefined));
}

function sanitizeValue(value) {
  if (typeof value === "string") {
    return creativeTeamPayloadDataImagePattern.test(value) ? "" : stripUnicodeReplacementCharacters(value);
  }
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "imageData" && key !== "fileData")
      .map(([key, item]) => [key, sanitizeValue(item)])
  );
}

function getReferenceImageUrl(reference = {}) {
  const value = reference.imageUrl || reference.imageData || "";
  return creativeTeamPayloadDataImagePattern.test(String(value)) ? "" : String(value || "");
}
