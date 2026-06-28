const creativeTeamPayloadDataImagePattern = /^data:image\/(?:png|jpe?g|webp);base64,/i;

export function createCreativeTeamPayload(body = {}) {
  const reference = compactReference(body.reference);
  const includeProductReferences = body.productVisibilityDecision
    ? body.productVisibilityDecision.shouldPassProductRefs === true
    : true;
  return {
    ...body,
    project: compactProject(body.project),
    product: compactProduct(body.product, { includeReferences: includeProductReferences }),
    reference,
    activeDesignReference: compactActiveDesignReference(body.activeDesignReference || reference),
    layoutContentPlan: body.layoutContentPlan || null,
    hookLibrary: body.hookLibrary || null,
    existingJobs: Array.isArray(body.existingJobs) ? body.existingJobs : [],
    diversitySlot: body.diversitySlot || null,
    topicCluster: sanitizeValue(body.topicCluster || null),
    topicClusterPlan: sanitizeValue(body.topicClusterPlan || null)
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
  if (typeof value === "string") return creativeTeamPayloadDataImagePattern.test(value) ? "" : value;
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
