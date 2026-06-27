export function isDesignReference(reference) {
  return !reference?.type || reference.type === "design";
}

export function getDesignReferences(project) {
  return (project?.references || []).filter(isDesignReference);
}

export function getActiveDesignReferences(project) {
  const references = getDesignReferences(project);
  const activeReferences = references.filter((reference) => reference.isActive !== false);
  return activeReferences.length ? activeReferences : references;
}

export function getFirstDesignReference(project) {
  return getDesignReferences(project)[0];
}

export function pickNextDesignReference({ project, fallbackReference, existingJobs = [], batchJobs = [] }) {
  const references = getActiveDesignReferences(project);
  if (!references.length) return fallbackReference || null;
  const usage = new Map(references.map((reference) => [getReferenceKey(reference), 0]));
  [...existingJobs, ...batchJobs].forEach((job) => countJobReferenceUsage(usage, references, job));
  return references.reduce((best, reference) =>
    usage.get(getReferenceKey(reference)) < usage.get(getReferenceKey(best)) ? reference : best
  , references[0]);
}

function countJobReferenceUsage(usage, references, job) {
  if (job?.referenceId && usage.has(job.referenceId)) {
    usage.set(job.referenceId, usage.get(job.referenceId) + 1);
    return;
  }
  const matchingReference = references.find((reference) => reference.title && reference.title === job?.referenceTitle);
  if (!matchingReference) return;
  const key = getReferenceKey(matchingReference);
  usage.set(key, usage.get(key) + 1);
}

function getReferenceKey(reference) {
  return reference?.id || reference?.title || "";
}
