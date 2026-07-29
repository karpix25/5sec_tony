import { createAudioEntity } from "./factories.js";

export function ensureGlobalAudioLibrary(state, fallbackAudios = []) {
  if (Array.isArray(state.audioLibrary)) return state.audioLibrary.map(createAudioEntity);
  const audios = collectProjectAudios(state.projects, fallbackAudios);
  return audios.length ? audios.map(createAudioEntity) : fallbackAudios.map(createAudioEntity);
}

export function addGlobalAudioFiles(audioLibrary, payloads) {
  if (!payloads.length) return audioLibrary;
  return [...payloads.map(createAudioEntity), ...audioLibrary.map(createAudioEntity)];
}

export function deleteGlobalAudio(audioLibrary, audioId) {
  return audioLibrary.filter((audio) => audio.id !== audioId);
}

export function deleteGlobalAudioMany(audioLibrary, audioIds = []) {
  const ids = new Set(audioIds.filter(Boolean));
  if (!ids.size) return audioLibrary;
  return audioLibrary.filter((audio) => !ids.has(audio.id));
}

export function getSelectedGlobalAudioId(audioLibrary, selectedAudioId) {
  return audioLibrary.some((audio) => audio.id === selectedAudioId)
    ? selectedAudioId
    : audioLibrary[0]?.id;
}

function collectProjectAudios(projects = [], fallbackAudios = []) {
  const byId = new Map();
  [...fallbackAudios, ...projects.flatMap((project) => project.audioLibrary || [])].forEach((audio) => {
    if (audio?.id && !byId.has(audio.id)) byId.set(audio.id, audio);
  });
  return [...byId.values()];
}
