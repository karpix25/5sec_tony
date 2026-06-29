export function pickAvatarVideoRoundRobin(project, characterId, preferences = {}) {
  const preferred = pickPreferredAvatarVideo(project, characterId, preferences);
  if (preferred) return preferred;
  const selected = characterId ? pickCharacterAvatarVideo(getActiveCharacters(project).find((character) => character.id === characterId)) : null;
  if (selected) {
    return {
      ...selected,
      nextCharacterIndex: normalizeAvatarVideoRotationIndex(project?.avatarRoundRobinIndex, getActiveCharacters(project).length)
    };
  }
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

function pickPreferredAvatarVideo(project, characterId, preferences = {}) {
  if (!preferences.videoId && !preferences.emotionName) return null;
  const characters = characterId
    ? getActiveCharacters(project).filter((character) => character.id === characterId)
    : getActiveCharacters(project);
  for (const character of characters) {
    const videos = getActiveReusableAvatarVideos(character);
    const video = preferences.videoId
      ? videos.find((item) => item.id === preferences.videoId)
      : videos.find((item) => normalizeRotationVideoName(item.name) === normalizeRotationVideoName(preferences.emotionName));
    if (video) {
      const index = videos.findIndex((item) => item.id === video.id);
      return {
        characterId: character.id,
        video,
        nextIndex: videos.length ? (index + 1) % videos.length : 0,
        nextCharacterIndex: normalizeAvatarVideoRotationIndex(project?.avatarRoundRobinIndex, getActiveCharacters(project).length)
      };
    }
  }
  return null;
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

function normalizeRotationVideoName(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}
