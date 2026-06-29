export function mergeAvatarVideoNameConflict({ baseState, localState, remoteState }) {
  if (!baseState || !localState || !remoteState) return null;
  if (!hasOnlyAvatarVideoNameChanges(baseState, localState)) return null;

  const updates = getAvatarVideoNameUpdates(baseState, localState);
  if (!updates.length) return null;
  if (!canApplyAvatarVideoNameUpdates(remoteState, updates)) return null;

  return applyAvatarVideoNameUpdates(remoteState, updates);
}

function hasOnlyAvatarVideoNameChanges(baseState, localState) {
  return stableStringify(stripAvatarVideoNames(baseState)) === stableStringify(stripAvatarVideoNames(localState));
}

function getAvatarVideoNameUpdates(baseState, localState) {
  const baseVideos = mapAvatarVideosByPath(baseState);
  return [...mapAvatarVideosByPath(localState).entries()]
    .filter(([path, localVideo]) => baseVideos.has(path) && normalizeName(localVideo.name) !== normalizeName(baseVideos.get(path).name))
    .map(([path, localVideo]) => ({
      path,
      baseName: normalizeName(baseVideos.get(path).name),
      name: normalizeName(localVideo.name)
    }))
    .filter((update) => update.name);
}

function canApplyAvatarVideoNameUpdates(remoteState, updates) {
  const remoteVideos = mapAvatarVideosByPath(remoteState);
  return updates.every((update) => (
    remoteVideos.has(update.path)
      && normalizeName(remoteVideos.get(update.path).name) === update.baseName
  ));
}

function applyAvatarVideoNameUpdates(remoteState, updates) {
  const updateByPath = new Map(updates.map((update) => [update.path, update.name]));
  return {
    ...remoteState,
    projects: (remoteState.projects || []).map((project) => ({
      ...project,
      characters: (project.characters || []).map((character) => ({
        ...character,
        avatarVideos: (character.avatarVideos || []).map((video) => {
          const path = createAvatarVideoPath(project, character, video);
          return updateByPath.has(path) ? { ...video, name: updateByPath.get(path) } : video;
        })
      }))
    }))
  };
}

function stripAvatarVideoNames(state) {
  return {
    ...state,
    projects: (state.projects || []).map((project) => ({
      ...project,
      characters: (project.characters || []).map((character) => ({
        ...character,
        avatarVideos: (character.avatarVideos || []).map((video) => ({ ...video, name: "" }))
      }))
    }))
  };
}

function mapAvatarVideosByPath(state) {
  const videos = new Map();
  (state.projects || []).forEach((project) => {
    (project.characters || []).forEach((character) => {
      (character.avatarVideos || []).forEach((video) => {
        videos.set(createAvatarVideoPath(project, character, video), video);
      });
    });
  });
  return videos;
}

function createAvatarVideoPath(project, character, video) {
  return `${project.id || ""}/${character.id || ""}/${video.id || ""}`;
}

function normalizeName(value) {
  return String(value || "").trim();
}

function stableStringify(value) {
  return JSON.stringify(value);
}
