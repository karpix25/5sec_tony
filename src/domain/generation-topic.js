export function pickGenerationTopic({ suppliedTopic, candidateTopic, lockedTopic, slot, existingJobs }) {
  if (lockedTopic) return lockedTopic;
  if (suppliedTopic && !shouldReplaceSuppliedTopic(suppliedTopic, existingJobs)) return suppliedTopic;
  return candidateTopic || slot?.topic || "";
}

function shouldReplaceSuppliedTopic(topic, existingJobs) {
  const normalized = normalizeTopicText(topic);
  if (!normalized) return false;
  const isRepeated = existingJobs.some((job) => normalizeTopicText(job.topic || job.title) === normalized);
  const isGenericFactPromise = /полезн\w*\s+факт\w*\s+от\s+красив\w*\s+обещан/i.test(topic);
  const isOverpackedList = String(topic || "").split(",").length >= 3 && /как\s+отлич|как\s+понять|проверь/i.test(topic);
  return isRepeated || isGenericFactPromise || isOverpackedList;
}

function normalizeTopicText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .trim();
}
