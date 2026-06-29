export function selectServerJobAudio(record, random = Math.random) {
  const library = getPlayableAudioLibrary(record);
  if (!library.length) return null;
  return library[getRandomIndex(library.length, random)];
}

function getPlayableAudioLibrary(record) {
  return (record?.context?.audioLibrary || []).filter((audio) => audio?.fileData);
}

function getRandomIndex(length, random) {
  const value = Number(random());
  if (!Number.isFinite(value)) return 0;
  return Math.min(length - 1, Math.max(0, Math.floor(value * length)));
}
