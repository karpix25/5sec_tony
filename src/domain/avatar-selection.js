export const noAvatarCharacterId = "__no_avatar__";

export function isNoAvatarCharacterId(value) {
  return String(value || "") === noAvatarCharacterId;
}

export function getCharacterSelectOptions(characters = []) {
  return [
    { id: noAvatarCharacterId, name: "Без аватара", status: "no-avatar" },
    ...characters
  ];
}
