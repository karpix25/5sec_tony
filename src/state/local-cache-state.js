import { readJsonStorage, removeJsonStorage, writeJsonStorage } from "../storage/json-storage.js";

export function readStateFromLocalCache(storageKey, storageVersion, fallbackState) {
  return readJsonStorage(storageKey, {
    fallback: fallbackState,
    version: storageVersion
  });
}

export function saveStateToLocalCache(storageKey, storageVersion, state) {
  return writeJsonStorage(storageKey, state, {
    version: storageVersion,
    compactValue: compactStateForLocalCache
  });
}

export function clearStateFromLocalCache(storageKey) {
  removeJsonStorage(storageKey);
}

export function compactStateForLocalCache(state) {
  if (!state || typeof state !== "object") return state;
  const compacted = { ...state };
  if (Array.isArray(state.projects)) compacted.projects = compactProjects(state.projects);
  if (Array.isArray(state.products)) compacted.products = compactProducts(state.products);
  if (Array.isArray(state.audioLibrary)) compacted.audioLibrary = compactAudioLibrary(state.audioLibrary);
  if (Array.isArray(state.jobs)) compacted.jobs = compactJobs(state.jobs);
  return compacted;
}

const compactTerminalJobFields = [
  "id",
  "projectId",
  "productId",
  "productName",
  "characterId",
  "status",
  "stage",
  "progress",
  "title",
  "topic",
  "music",
  "imageUrl",
  "imageData",
  "finalVideoUrl",
  "finalVideoHasAudio",
  "diskStatus",
  "diskPath",
  "diskUrl",
  "diskVerifiedAt",
  "diskSize",
  "diskVerification",
  "diskPublicUrl",
  "yandexDiskUrl",
  "diskMessage",
  "yandexDiskRequired",
  "failMsg",
  "outputType",
  "requiresFinalVideo",
  "renderedWithoutAvatar",
  "productVisualMode",
  "inputUrls",
  "inputRefs",
  "quotaCountedAt",
  "quotaCountedStatus",
  "createdAt",
  "updatedAt",
  "serverJobAcceptedAt",
  "serverJobCompletedAt",
  "serverJobFailedAt",
  "completedAt",
  "finishedAt",
  "briefStartedAt",
  "referenceId",
  "referenceTitle",
  "generationSource",
  "source",
  "serverBatchSource"
];

function compactProjects(projects) {
  return projects.map((project) => ({
    ...project,
    ...compactOptionalArray(project, "references", compactImageCollection),
    ...compactOptionalArray(project, "audioLibrary", compactAudioLibrary),
    ...compactOptionalArray(project, "avatarCandidates", compactImageCollection),
    ...compactOptionalArray(project, "designReferenceCandidates", compactImageCollection),
    ...compactOptionalArray(project, "characters", (items) => items.map(compactCharacter))
  }));
}

function compactCharacter(character) {
  return {
    ...compactImageFields(character),
    avatarVideos: (character.avatarVideos || []).map(compactAvatarVideo)
  };
}

function compactAvatarVideo(video) {
  return {
    ...video,
    sourceVideoUrl: keepRemoteAssetUrl(video.sourceVideoUrl),
    alphaVideoUrl: keepRemoteAssetUrl(video.alphaVideoUrl),
    previewImageData: keepRemoteAssetUrl(video.previewImageData)
  };
}

function compactProducts(products) {
  return products.map((product) => ({
    ...product,
    ...compactOptionalArray(product, "references", compactImageCollection)
  }));
}

function compactOptionalArray(source, key, compact) {
  return Array.isArray(source?.[key]) ? { [key]: compact(source[key]) } : {};
}

function compactOptionalObject(source, key, compact) {
  const value = source?.[key];
  return value && typeof value === "object" && !Array.isArray(value) ? { [key]: compact(value) } : {};
}

function compactAudioLibrary(audioLibrary) {
  return audioLibrary.map((audio) => ({
    ...audio,
    fileData: keepRemoteAssetUrl(audio.fileData)
  }));
}

function compactJobs(jobs) {
  return jobs.map((job) => compactQueueJob({
    ...job,
    imageData: compactJobPreview(job),
    inputUrls: (job.inputUrls || []).filter((url) => !isEmbeddedAssetUrl(url)),
    inputRefs: compactInputRefs(job.inputRefs)
  }));
}

function compactQueueJob(job) {
  return removeEmptyFields({
    ...pickFields(job, compactTerminalJobFields),
    ...pickQueueFields(job),
    title: compactText(job.title, 360),
    topic: compactText(job.topic, 360),
    music: compactText(job.music, 160),
    failMsg: compactText(job.failMsg, 500),
    diskMessage: compactText(job.diskMessage, 500),
    queueLastError: compactText(job.queueLastError, 500),
    diskPath: keepPublicHttpUrl(job.diskPath),
    inputRefs: compactInputRefs(job.inputRefs),
    selectionSnapshot: compactSelectionSnapshot(job.selectionSnapshot),
    productVisibilityDecision: compactProductVisibilityDecision(job.productVisibilityDecision),
    promptContract: compactPromptContract(job.promptContract || job.imagePromptContract),
    aiTrace: compactAiTrace(job.aiTrace),
    creativeBrief: compactCreativeBrief(job.creativeBrief)
  });
}

function compactInputRefs(inputRefs) {
  if (!Array.isArray(inputRefs)) return inputRefs;
  return inputRefs.map((item) => pickFields(item, ["role", "title", "isLocalData"]));
}

function compactSelectionSnapshot(snapshot) {
  return snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
    ? removeEmptyFields(pickFields(snapshot, ["productId"]))
    : undefined;
}

function compactProductVisibilityDecision(decision) {
  return decision && typeof decision === "object" && !Array.isArray(decision)
    ? removeEmptyFields(pickFields(decision, ["shouldPassProductRefs", "productVisualMode", "mode", "reason"]))
    : undefined;
}

function compactPromptContract(contract) {
  if (!contract || typeof contract !== "object" || Array.isArray(contract)) return undefined;
  return removeEmptyFields({
    ...pickFields(contract, ["referencePriority"]),
    productVisibilityDecision: compactProductVisibilityDecision(contract.productVisibilityDecision),
    inputRefs: compactInputRefs(contract.inputRefs)
  });
}

function compactAiTrace(trace) {
  if (!trace || typeof trace !== "object" || Array.isArray(trace)) return undefined;
  return removeEmptyFields({
    ...pickFields(trace, ["version", "hookSeed", "selectedAngle"]),
    imagePromptContract: compactPromptContract(trace.imagePromptContract)
  });
}

function compactCreativeBrief(brief) {
  return brief && typeof brief === "object" && !Array.isArray(brief)
    ? removeEmptyFields({ topic: compactText(brief.topic, 360) })
    : undefined;
}

function compactText(value, maxLength) {
  const text = String(value || "");
  if (!text || text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}…`;
}

function keepPublicHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || "")) ? String(value) : undefined;
}

function pickFields(source, fields) {
  return fields.reduce((result, field) => {
    if (hasOwn(source, field)) result[field] = source[field];
    return result;
  }, {});
}

function pickQueueFields(source) {
  return Object.fromEntries(Object.entries(source || {}).filter(([key]) => key.startsWith("queue") && key !== "queueMetadata"));
}

function hasOwn(source, field) {
  return Object.prototype.hasOwnProperty.call(source || {}, field);
}

function removeEmptyFields(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function compactServerJobContext(context) {
  return {
    ...context,
    project: context.project ? compactProjects([context.project])[0] : context.project,
    product: context.product ? compactProducts([context.product])[0] : context.product,
    products: Array.isArray(context.products) ? compactProducts(context.products) : context.products
  };
}

function compactJobPreview(job) {
  if (!job?.imageData) return "";
  if (job.imageData === job.imageUrl) return "";
  return keepRemoteAssetUrl(job.imageData);
}

function compactImageCollection(items) {
  return items.map(compactImageFields);
}

function compactImageFields(item) {
  return {
    ...item,
    imageData: keepRemoteAssetUrl(item?.imageData),
    fileData: keepRemoteAssetUrl(item?.fileData)
  };
}

function keepRemoteAssetUrl(value) {
  return isEmbeddedAssetUrl(value) ? "" : String(value || "");
}

function isEmbeddedAssetUrl(value) {
  return /^data:(?:image|audio|video)\//i.test(String(value || ""));
}
