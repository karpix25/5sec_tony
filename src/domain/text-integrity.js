const unicodeReplacementCharacterPattern = /\uFFFD+/g;

export function hasUnicodeReplacementCharacter(value) {
  if (typeof value === "string") return /\uFFFD/.test(value);
  if (Array.isArray(value)) return value.some(hasUnicodeReplacementCharacter);
  if (value && typeof value === "object") return Object.values(value).some(hasUnicodeReplacementCharacter);
  return false;
}

export function stripUnicodeReplacementCharacters(value) {
  return String(value ?? "").replace(unicodeReplacementCharacterPattern, "");
}
