export function assertPlayableAudioLibrary(audioLibrary = []) {
  if (hasPlayableAudio(audioLibrary)) return;
  throw new Error("Сначала загрузите аудио в библиотеку. Без аудио картинки и видео не создаются.");
}

export function hasPlayableAudio(audioLibrary = []) {
  return audioLibrary.some((audio) => Boolean(audio?.fileData));
}
