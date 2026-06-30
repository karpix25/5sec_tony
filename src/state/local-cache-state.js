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

function compactAudioLibrary(audioLibrary) {
  return audioLibrary.map((audio) => ({
    ...audio,
    fileData: keepRemoteAssetUrl(audio.fileData)
  }));
}

function compactJobs(jobs) {
  return jobs.map((job) => ({
    ...job,
    imageData: compactJobPreview(job),
    inputUrls: (job.inputUrls || []).filter((url) => !isEmbeddedAssetUrl(url))
  }));
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
