import { readJsonStorage, writeJsonStorage } from "../storage/json-storage.js";

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

export function compactStateForLocalCache(state) {
  if (!state || typeof state !== "object") return state;
  return {
    ...state,
    projects: compactProjects(state.projects || []),
    products: compactProducts(state.products || []),
    audioLibrary: compactAudioLibrary(state.audioLibrary || []),
    jobs: compactJobs(state.jobs || [])
  };
}

function compactProjects(projects) {
  return projects.map((project) => ({
    ...project,
    references: compactImageCollection(project.references || []),
    audioLibrary: compactAudioLibrary(project.audioLibrary || []),
    avatarCandidates: compactImageCollection(project.avatarCandidates || []),
    designReferenceCandidates: compactImageCollection(project.designReferenceCandidates || []),
    characters: (project.characters || []).map(compactCharacter)
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
    references: compactImageCollection(product.references || [])
  }));
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
