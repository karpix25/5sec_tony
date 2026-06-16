export function pickAvatarVideoRoundRobin(project, characterId) {
  const characters = project?.characters || [];
  const selectedCharacter = characters.find((character) => character.id === characterId);
  const selectedPick = pickCharacterAvatarVideo(selectedCharacter);
  if (selectedPick) return selectedPick;

  return characters.map(pickCharacterAvatarVideo).find(Boolean) || null;
}

export function getCompositeAvatarVideoUrl(video) {
  return video?.alphaVideoUrl || video?.videoUrl || "";
}

function pickCharacterAvatarVideo(character) {
  const videos = getActiveReusableAvatarVideos(character);
  if (!videos.length) return null;
  const index = normalizeAvatarVideoRotationIndex(character.avatarVideoRoundRobinIndex, videos.length);
  return {
    characterId: character.id,
    video: videos[index],
    nextIndex: (index + 1) % videos.length
  };
}

function getActiveReusableAvatarVideos(character) {
  return (character?.avatarVideos || [])
    .filter((video) => video.status === "ready")
    .filter((video) => video.isActive !== false)
    .filter((video) => getCompositeAvatarVideoUrl(video));
}

function normalizeAvatarVideoRotationIndex(value, length) {
  const number = Number(value);
  if (!Number.isFinite(number) || length <= 0) return 0;
  return Math.min(length - 1, Math.max(0, Math.round(number)));
}
