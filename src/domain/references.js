export function isDesignReference(reference) {
  return !reference?.type || reference.type === "design";
}

export function getDesignReferences(project) {
  return (project?.references || []).filter(isDesignReference);
}

export function getFirstDesignReference(project) {
  return getDesignReferences(project)[0];
}
