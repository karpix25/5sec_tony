export function pickAvatarVideoRoundRobin(project, characterId) {
  const picks = getActiveCharacters(project)
    .map(pickCharacterAvatarVideo)
    .filter(Boolean);
  if (!picks.length) return null;
  const index = normalizeAvatarVideoRotationIndex(project?.avatarRoundRobinIndex, picks.length);
  return {
    ...picks[index],
    nextCharacterIndex: (index + 1) % picks.length
  };
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

function getActiveCharacters(project) {
  return (project?.characters || []).filter((character) => character.isActive !== false);
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
